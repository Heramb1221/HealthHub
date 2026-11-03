import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGoogleCalendarWebUrl, generateMedicationIcs, icsEscape, icsFold, type MedicationCalendarItem } from "../src/lib/calendar";

const NOW = new Date("2026-10-25T03:00:00Z");
const item = (o: Partial<MedicationCalendarItem> = {}): MedicationCalendarItem => ({
  id: "s1", medicationName: "Metformin", strength: "500 mg", dose: "1 tablet", frequency: "twice daily", time: "08:00",
  startDate: "2026-10-01", endDate: null, timezone: "Asia/Kolkata", ...o,
});
const lines = (ics: string) => ics.split("\r\n");

describe(".ics export", () => {
  it("writes each reminder in its own zone, starting today, and ends a late dose on the next day", () => {
    const l = lines(generateMedicationIcs([item({ time: "23:55" })], NOW));
    assert.ok(l.includes("DTSTART;TZID=Asia/Kolkata:20261025T235500"));
    assert.ok(l.includes("DTEND;TZID=Asia/Kolkata:20261026T001000"));
  });

  it("uses the right zone per item instead of the first item's zone", () => {
    const ics = generateMedicationIcs([item(), item({ id: "s2", timezone: "America/New_York" })], NOW);
    assert.ok(ics.includes("DTSTART;TZID=Asia/Kolkata:"));
    assert.ok(ics.includes("DTSTART;TZID=America/New_York:"));
  });

  it("ends the series at the end of the last day in the medicine's own zone", () => {
    const ics = generateMedicationIcs([item({ timezone: "America/Los_Angeles", endDate: "2026-10-31", time: "20:00" })], NOW);
    assert.ok(ics.includes("RRULE:FREQ=DAILY;UNTIL=20261101T065900Z"));
  });

  it("gives the same reminder the same UID every time, so re-importing cannot duplicate", () => {
    const uid = (ics: string) => lines(ics).find((x) => x.startsWith("UID:"));
    assert.equal(uid(generateMedicationIcs([item()], NOW)), uid(generateMedicationIcs([item()], new Date("2026-11-30T00:00:00Z"))));
    assert.notEqual(uid(generateMedicationIcs([item()], NOW)), uid(generateMedicationIcs([item({ time: "20:00" })], NOW)));
  });

  it("escapes text and folds long lines, so a medicine name with commas or a long note cannot break the file", () => {
    assert.equal(icsEscape("A, B; C\\D\nE"), "A\\, B\\; C\\\\D\\nE");
    const ics = generateMedicationIcs([item({ medicationName: "Name, with; odd chars", instructions: "x".repeat(300) })], NOW);
    assert.ok(ics.includes("Name\\, with\\; odd chars"));
    for (const line of lines(ics)) assert.ok(new TextEncoder().encode(line).length <= 75, `too long: ${line.length}`);
    const folded = icsFold("DESCRIPTION:" + "é".repeat(80));
    assert.ok(lines(folded).every((p) => new TextEncoder().encode(p).length <= 75));
    assert.equal(folded.replace(/\r\n /g, ""), "DESCRIPTION:" + "é".repeat(80));
  });
});

describe("Google Calendar link", () => {
  it("uses the item's zone, a correct end time and a zone-correct series end", () => {
    const url = new URL(createGoogleCalendarWebUrl(item({ time: "23:55", timezone: "America/Los_Angeles", endDate: "2026-10-31" })));
    assert.equal(url.searchParams.get("ctz"), "America/Los_Angeles");
    assert.match(url.searchParams.get("dates") ?? "", /T235500\/\d{8}T001000$/);
    assert.equal(url.searchParams.get("recur"), "RRULE:FREQ=DAILY;UNTIL=20261101T065900Z");
  });
});
