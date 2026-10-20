import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { setLogSink } from "../src/lib/logger.js";

const env = loadEnv({ DATABASE_URL: "postgresql://u:p@localhost:5432/x", JWT_SECRET: "j".repeat(40) });
const UUID = "2c92740c-8321-4029-bd82-0aeb60183d81";

describe("request logging", () => {
  let lines: string[] = [];
  beforeEach(() => {
    lines = [];
    setLogSink((line) => lines.push(line));
  });
  afterEach(() => setLogSink(null));

  const app = createApp(env, (router) => {
    router.get("/things/:thingId", (_req, res) => {
      res.json({ data: "ok" });
    });
    router.get("/boom/:thingId", () => {
      throw new Error("secret detail");
    });
  });
  const parsed = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

  it("logs the route pattern, never ids, query strings, or other URL content", async () => {
    await request(app).get(`/api/v1/things/${UUID}?token=abc.def.ghi&patient=HH-SECRET`).set("Authorization", "Bearer eyJsecret.token.value");
    const entry = parsed().find((l) => l.message === "request");
    expect(entry).toMatchObject({ method: "GET", route: "/api/v1/things/:thingId", status: 200 });
    const text = lines.join("\n");
    for (const hidden of [UUID, "token=", "abc.def.ghi", "HH-SECRET", "eyJsecret", "Bearer", "path"]) expect(text).not.toContain(hidden);
  });

  it("labels unmatched requests without echoing the URL", async () => {
    await request(app).get(`/api/v1/does/not/exist/${UUID}?x=1`);
    await request(app).get(`/totally/unknown/${UUID}`);
    const entries = parsed().filter((l) => l.message === "request");
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.status)).toEqual([404, 404]);
    for (const e of entries) expect(String(e.route)).not.toContain(UUID);
    expect(lines.join("\n")).not.toContain("exist");
    expect(lines.join("\n")).not.toContain("unknown");
  });

  it("logs unexpected errors by route pattern and error type only", async () => {
    await request(app).get(`/api/v1/boom/${UUID}`);
    const entry = parsed().find((l) => l.message === "unhandled error");

    expect(entry).toMatchObject({ route: "/boom/:thingId", errorName: "Error" });
    const text = lines.join("\n");
    expect(text).not.toContain(UUID);
    expect(text).not.toContain("secret detail");
  });

  it("does not let a hostile path inject extra log lines or fields", async () => {
    await request(app).get("/api/v1/x%0A%7B%22level%22:%22error%22%7D");
    expect(lines.every((l) => l.split("\n").length === 1)).toBe(true);
    expect(parsed().every((l) => l.message === "request")).toBe(true);
  });
});
