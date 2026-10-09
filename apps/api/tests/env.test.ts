import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../src/config/env.js";

const DB = { DATABASE_URL: "postgresql://u:p@localhost:5432/x" };

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv({ ...DB });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
  });

  it("parses a comma-separated origin list", () => {
    const env = loadEnv({ ...DB, CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("rejects an invalid port and names only the variable", () => {
    try {
      loadEnv({ ...DB, PORT: "not-a-number" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).variables).toEqual(["PORT"]);
      expect((err as EnvError).message).not.toContain("not-a-number");
    }
  });

  it("rejects wildcard CORS origins", () => {
    expect(() => loadEnv({ ...DB, CORS_ORIGINS: "*" })).toThrow(EnvError);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadEnv({ ...DB, NODE_ENV: "staging" })).toThrow(EnvError);
  });

  it("requires a postgres DATABASE_URL and never echoes it", () => {
    try {
      loadEnv({ DATABASE_URL: "mysql://secret-user:secret-pw@host/db" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).variables).toEqual(["DATABASE_URL"]);
      expect((err as EnvError).message).not.toContain("secret");
    }
    expect(() => loadEnv({})).toThrow(EnvError);
  });
});
