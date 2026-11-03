import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyQrReference } from "../src/lib/api/qr";

describe("classifyQrReference", () => {
  it("recognises share-session ids and Health IDs, and rejects everything else", () => {
    assert.equal(classifyQrReference("6f1c2f0e-3b52-4f4b-9a5e-0d6e0c1d7a11"), "session");
    assert.equal(classifyQrReference("HH-7K2M9QXD"), "emergency");
    for (const bad of ["", "hh", "HH-123", "HH-<script>", "../../etc/passwd", "https://evil.example", "6f1c2f0e-3b52-4f4b-9a5e", "HH-7K2M9QXDX"]) {
      assert.equal(classifyQrReference(bad), "invalid", bad);
    }
  });
});
