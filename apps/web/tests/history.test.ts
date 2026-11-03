import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toAddConditionBody } from "../src/lib/api/history";

describe("history API payload", () => {
  it("sends `title` (what the strict API schema requires), never `name`", () => {
    const body = toAddConditionBody({ name: "  Asthma ", diagnosedOn: "2020-01-02", notes: null });
    assert.deepEqual(body, { title: "Asthma", diagnosedOn: "2020-01-02", notes: null });
    assert.equal("name" in body, false);
  });
});
