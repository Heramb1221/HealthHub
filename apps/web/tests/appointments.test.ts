import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toBookBody } from "../src/lib/api/appointments";

describe("appointment booking payload", () => {
  it("sends only slotId; the API rejects unknown keys such as hospitalId", () => {
    assert.deepEqual(toBookBody({ hospitalId: "h1", slotId: "s1" }), { slotId: "s1" });
  });
});
