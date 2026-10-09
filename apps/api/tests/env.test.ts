import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../src/config/env.js";

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
  });

  it("parses a comma-separated origin list", () => {
    const env = loadEnv({ CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("rejects an invalid port and names only the variable", () => {
    try {
      loadEnv({ PORT: "not-a-number" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).variables).toEqual(["PORT"]);
      expect((err as EnvError).message).not.toContain("not-a-number");
    }
  });

  it("rejects wildcard CORS origins", () => {
    expect(() => loadEnv({ CORS_ORIGINS: "*" })).toThrow(EnvError);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrow(EnvError);
  });
});
