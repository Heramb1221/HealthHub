import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { describeError, isApiError } from "../src/api/errors.ts";
import { apiUrl, configureHttp, request, requestList, unwrapEnvelope } from "../src/api/http.ts";

interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  contentType: string | undefined;
  body: string;
}

let server: Server;
let base = "";
let seen: Seen[] = [];
let token: string | null = null;
let unauthorizedCalls = 0;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    seen.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, contentType: req.headers["content-type"], body });
    const send = (status: number, payload?: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };
    const url = req.url ?? "";
    if (url === "/api/v1/patients/me") return send(200, { data: { id: "p1", healthId: "HH-123" } });
    if (url === "/api/v1/bare") return send(200, { id: "x" });
    if (url === "/api/v1/prescriptions") return send(200, { data: [{ id: "a" }, { id: "b" }], page: { limit: 2, nextCursor: "c2" } });
    if (url.startsWith("/api/v1/prescriptions?cursor=c2")) return send(200, { data: [{ id: "c" }], page: { limit: 2, nextCursor: null } });
    if (url === "/api/v1/auth/login") return send(401, { error: { code: "UNAUTHENTICATED", message: "Invalid credentials", requestId: "r1" } });
    if (url === "/api/v1/secret") return send(401, { error: { code: "UNAUTHENTICATED", message: "expired", requestId: "r2" } });
    if (url === "/api/v1/booked") return send(409, { error: { code: "CONFLICT", message: "Slot already booked", requestId: "r3" } });
    if (url === "/api/v1/html") {
      res.writeHead(502, { "Content-Type": "text/html" });
      return res.end("<html>bad gateway with secrets</html>");
    }
    if (url === "/api/v1/slow") return; // never responds: exercises the timeout
    if (url === "/api/v1/empty") return send(204);
    send(404, { error: { code: "NOT_FOUND", message: "nope", requestId: "r4" } });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  seen = [];
  token = null;
  unauthorizedCalls = 0;
  configureHttp({ baseUrl: base, getToken: () => token, onUnauthorized: () => void unauthorizedCalls++ });
});

describe("unwrapEnvelope", () => {
  it("unwraps a sole data key and leaves other shapes alone", () => {
    assert.deepEqual(unwrapEnvelope({ data: { a: 1 } }), { a: 1 });
    assert.deepEqual(unwrapEnvelope({ id: "x", data: 1 }), { id: "x", data: 1 });
    assert.deepEqual(unwrapEnvelope([1, 2]), [1, 2]);
  });
});

describe("request", () => {
  it("unwraps { data } and sends no Authorization header without a token", async () => {
    const me = await request<{ healthId: string }>("/patients/me");
    assert.equal(me.healthId, "HH-123");
    assert.equal(seen[0]?.auth, undefined);
  });

  it("sends the bearer token in the header, never in the URL", async () => {
    token = "tok-abc";
    await request("/patients/me");
    assert.equal(seen[0]?.auth, "Bearer tok-abc");
    assert.ok(!seen[0]?.url.includes("tok-abc"));
  });

  it("accepts a bare resource", async () => {
    assert.deepEqual(await request("/bare"), { id: "x" });
  });

  it("sends JSON bodies with a content type", async () => {
    await request("/patients/me", { method: "PATCH", json: { fullName: "Test Person" } });
    assert.equal(seen[0]?.method, "PATCH");
    assert.equal(seen[0]?.contentType, "application/json");
    assert.deepEqual(JSON.parse(seen[0]?.body ?? "{}"), { fullName: "Test Person" });
  });

  it("returns undefined for an empty success body", async () => {
    assert.equal(await request("/empty"), undefined);
  });

  it("maps the error envelope to ApiError with the request id", async () => {
    await assert.rejects(request("/booked", { method: "POST", json: {} }), (e: unknown) => {
      assert.ok(isApiError(e));
      assert.equal(e.code, "CONFLICT");
      assert.equal(e.status, 409);
      assert.equal(e.requestId, "r3");
      return true;
    });
  });

  it("does not leak a non-JSON error body", async () => {
    await assert.rejects(request("/html"), (e: unknown) => {
      assert.ok(isApiError(e));
      assert.equal(e.code, "INVALID_RESPONSE");
      assert.ok(!e.message.includes("secrets"));
      return true;
    });
  });

  it("calls onUnauthorized when an authenticated request gets 401", async () => {
    token = "expired";
    await assert.rejects(request("/secret"));
    assert.equal(unauthorizedCalls, 1);
  });

  it("does not call onUnauthorized for wrong-credentials sign-in (no token) or when skipped", async () => {
    await assert.rejects(request("/auth/login", { method: "POST", json: {} }));
    token = "t";
    await assert.rejects(request("/auth/login", { method: "POST", json: {}, skipUnauthorizedHandler: true }));
    assert.equal(unauthorizedCalls, 0);
  });

  it("reports a network failure as NETWORK_ERROR", async () => {
    configureHttp({ baseUrl: "http://127.0.0.1:1/api/v1", getToken: () => null, onUnauthorized: () => {} });
    await assert.rejects(request("/patients/me"), (e: unknown) => isApiError(e) && e.code === "NETWORK_ERROR" && e.isNetwork);
  });

  it("times out", async () => {
    await assert.rejects(request("/slow", { timeoutMs: 100 }), (e: unknown) => isApiError(e) && e.code === "TIMEOUT");
  });

  it("refuses to call anything when no API address is configured", async () => {
    configureHttp({ baseUrl: null, getToken: () => null, onUnauthorized: () => {} });
    await assert.rejects(request("/patients/me"), (e: unknown) => isApiError(e) && e.code === "NOT_CONFIGURED");
    assert.equal(seen.length, 0);
  });

  it("builds query strings and skips empty values", () => {
    assert.equal(apiUrl("/x", { cursor: "a b", limit: 5, skip: undefined, empty: "" }), `${base}/x?cursor=a+b&limit=5`);
  });
});

describe("requestList", () => {
  it("returns items and the next cursor", async () => {
    const page = await requestList<{ id: string }>("/prescriptions");
    assert.deepEqual(page.items.map((i) => i.id), ["a", "b"]);
    assert.equal(page.nextCursor, "c2");
    const last = await requestList<{ id: string }>("/prescriptions", { query: { cursor: "c2" } });
    assert.equal(last.nextCursor, null);
  });

  it("rejects a non-list body", async () => {
    await assert.rejects(requestList("/bare"), (e: unknown) => isApiError(e) && e.code === "INVALID_RESPONSE");
  });
});

describe("describeError", () => {
  it("gives plain-language, retry-aware messages", () => {
    const net = describeError(new (class extends Error {})("x"));
    assert.equal(net.retryable, true);
  });
});
