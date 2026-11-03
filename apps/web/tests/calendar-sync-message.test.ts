import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeCalendarSync } from "../src/lib/calendar-sync-message";

const res = (o: Record<string, number>) => ({ syncedCount: 0, events: [], ...o });

describe("describeCalendarSync never overclaims", () => {
  it("reports success only when events are in place and nothing failed", () => {
    const m = describeCalendarSync(res({ syncedCount: 2, removedCount: 0, failedCount: 0 }));
    assert.equal(m.tone, "success");
    assert.match(m.title, /2 reminders/);
  });
  it("says so when old events were removed", () => {
    assert.match(describeCalendarSync(res({ syncedCount: 1, removedCount: 2 })).description ?? "", /2 old events removed/);
  });
  it("is honest about partial and total failure", () => {
    assert.equal(describeCalendarSync(res({ syncedCount: 1, failedCount: 1 })).tone, "warning");
    assert.equal(describeCalendarSync(res({ failedCount: 2 })).tone, "error");
  });
  it("does not dress up 'nothing to do' as a sync", () => {
    const m = describeCalendarSync(res({ skippedCount: 2 }));
    assert.equal(m.tone, "info");
    assert.match(m.description ?? "", /off, paused, finished or out of date/);
  });
  it("copes with an older server that returns only syncedCount", () => {
    assert.equal(describeCalendarSync({ syncedCount: 3, events: [] }).tone, "success");
  });
});
