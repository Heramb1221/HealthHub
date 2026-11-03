import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "../src/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    for (const ok of ["/dashboard", "/qr/HH-7K2M9QXD", "/prescriptions/abc?x=1#top"]) assert.equal(safeNextPath(ok), ok);
  });
  it("drops anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example", "/ok\r\nSet-Cookie: a=b", ""]) {
      assert.equal(safeNextPath(bad), undefined, bad);
    }
    assert.equal(safeNextPath(undefined), undefined);
  });
});
