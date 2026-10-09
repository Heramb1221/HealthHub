import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { AppError } from "../src/lib/errors.js";

const env = loadEnv({ CORS_ORIGINS: "http://allowed.test" });

const app = createApp(env, (router) => {
  router.get("/boom", () => {
    throw new Error("secret database detail postgresql://user:pw@host/db");
  });
  router.get("/forbidden", () => {
    throw new AppError("FORBIDDEN");
  });
  router.post("/echo", (req, res) => {
    res.json({ data: req.body });
  });
});

describe("health", () => {
  it("returns 200 with the data envelope and a request id", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: "ok" } });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("error handling", () => {
  it("returns the contract error shape for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("maps AppError to its code and status", async () => {
    const res = await request(app).get("/api/v1/forbidden");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("hides internals of unexpected errors", async () => {
    const res = await request(app).get("/api/v1/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("postgresql");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("stack");
  });

  it("returns VALIDATION_ERROR for malformed JSON", async () => {
    const res = await request(app).post("/api/v1/echo").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns PAYLOAD_TOO_LARGE for oversized JSON", async () => {
    const res = await request(app)
      .post("/api/v1/echo")
      .send({ blob: "x".repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("security headers and CORS", () => {
  it("sets helmet headers and hides x-powered-by", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows a listed origin and denies others", async () => {
    const allowed = await request(app).get("/api/v1/health").set("Origin", "http://allowed.test");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://allowed.test");
    const denied = await request(app).get("/api/v1/health").set("Origin", "http://evil.test");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("returns RATE_LIMITED after the limit is exceeded", async () => {
    const limited = createApp(loadEnv({ RATE_LIMIT_MAX: "2" }), (router) => {
      router.get("/ping", (_req, res) => {
        res.json({ data: "pong" });
      });
    });
    await request(limited).get("/api/v1/ping").expect(200);
    await request(limited).get("/api/v1/ping").expect(200);
    const res = await request(limited).get("/api/v1/ping");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
