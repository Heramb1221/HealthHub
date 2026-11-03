import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...parts), "utf8");

describe("zoned-time module copies", () => {
  it("api, web and mobile use byte-identical time-zone code, so every platform computes the same reminder instants", () => {
    const api = read("api", "src", "lib", "zonedTime.ts");
    expect(read("web", "src", "lib", "zoned-time.ts")).toBe(api);
    expect(read("mobile", "src", "lib", "zonedTime.ts")).toBe(api);
  });
});
