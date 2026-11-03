import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diffReminders, reminderContent, REMINDER_TITLE } from "../src/lib/reminderSync.ts";
import { REMINDER_ID_PREFIX, type PlannedReminder } from "../src/lib/schedule.ts";

const item = (id: string, name = "Metformin 500 mg"): PlannedReminder => ({
  identifier: `${REMINDER_ID_PREFIX}${id}`, at: new Date("2026-10-25T14:30:00Z"), time: "20:00", scheduleId: "s1", medicationName: name,
});

describe("reminderContent: lock-screen privacy", () => {
  it("names no medicine by default", () => {
    const c = reminderContent(item("a"), false);
    assert.equal(c.title, REMINDER_TITLE);
    assert.ok(!JSON.stringify(c).includes("Metformin"));
    assert.match(c.body, /dose is due/);
  });
  it("names the medicine only when the patient opts in, and never puts it in the data payload", () => {
    const c = reminderContent(item("a"), true);
    assert.match(c.body, /Metformin 500 mg/);
    assert.ok(!JSON.stringify(c.data).includes("Metformin"));
    assert.ok(!c.title.includes("Metformin"));
  });
});

describe("diffReminders: edits and repeated syncs cannot duplicate or over-cancel", () => {
  const plan = [item("a"), item("b")];

  it("adds only what is missing and cancels only stale reminders of ours", () => {
    const d = diffReminders([`${REMINDER_ID_PREFIX}a`, `${REMINDER_ID_PREFIX}old`], plan);
    assert.deepEqual(d.add.map((p) => p.identifier), [`${REMINDER_ID_PREFIX}b`]);
    assert.deepEqual(d.cancel, [`${REMINDER_ID_PREFIX}old`]);
  });

  it("is idempotent: syncing again with nothing changed does nothing", () => {
    const d = diffReminders(plan.map((p) => p.identifier), plan);
    assert.deepEqual(d, { cancel: [], add: [] });
  });

  it("never cancels notifications that are not ours", () => {
    const d = diffReminders(["appointment-123", "other:thing", `${REMINDER_ID_PREFIX}stale`], []);
    assert.deepEqual(d.cancel, [`${REMINDER_ID_PREFIX}stale`]);
  });

  it("cancels everything when a schedule is stopped or finished (empty plan)", () => {
    const d = diffReminders([`${REMINDER_ID_PREFIX}a`, `${REMINDER_ID_PREFIX}b`], []);
    assert.equal(d.cancel.length, 2);
    assert.equal(d.add.length, 0);
  });

  it("re-adds everything under the same identifiers when forced (settings changed), replacing rather than duplicating", () => {
    const d = diffReminders(plan.map((p) => p.identifier), plan, true);
    assert.equal(d.add.length, 2);
    assert.deepEqual(d.cancel, []);
  });
});
