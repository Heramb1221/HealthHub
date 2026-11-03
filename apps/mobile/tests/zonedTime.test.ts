import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDays, dateInZone, isValidTimeZone, timeInZone, zonedInstant } from "../src/lib/zonedTime.ts";

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("zonedInstant: ordinary days", () => {
  it("converts wall-clock time in a zone to the right instant", () => {
    assert.equal(iso(zonedInstant("2026-10-25", "08:00", "Asia/Kolkata")), "2026-10-25T02:30:00.000Z");
    assert.equal(iso(zonedInstant("2026-10-25", "20:00", "Asia/Kolkata")), "2026-10-25T14:30:00.000Z");
    assert.equal(iso(zonedInstant("2026-01-15", "08:00", "America/New_York")), "2026-01-15T13:00:00.000Z");
    assert.equal(iso(zonedInstant("2026-07-15", "08:00", "America/New_York")), "2026-07-15T12:00:00.000Z");
    assert.equal(iso(zonedInstant("2026-07-15", "08:00", "UTC")), "2026-07-15T08:00:00.000Z");
    assert.equal(iso(zonedInstant("2026-07-15", "23:59", "Pacific/Auckland")), "2026-07-15T11:59:00.000Z");
  });

  it("handles half-hour and 45-minute zones and midnight", () => {
    assert.equal(iso(zonedInstant("2026-10-25", "00:00", "Asia/Kolkata")), "2026-10-24T18:30:00.000Z");
    assert.equal(iso(zonedInstant("2026-10-25", "12:00", "Asia/Kathmandu")), "2026-10-25T06:15:00.000Z");
  });

  it("rejects malformed input instead of guessing", () => {
    for (const [d, t, z] of [["2026-02-30", "08:00", "UTC"], ["2026-13-01", "08:00", "UTC"], ["2026-10-25", "24:00", "UTC"], ["2026-10-25", "8:00", "UTC"], ["2026-10-25", "08:00", "Not/AZone"], ["", "", ""]] as const) {
      assert.equal(zonedInstant(d, t, z), null);
    }
  });
});

describe("zonedInstant: daylight-saving changes", () => {
  it("spring forward: a time that does not exist moves to the first valid moment that day", () => {
    // New York, Sunday 8 March 2026: clocks jump from 02:00 to 03:00.
    assert.equal(iso(zonedInstant("2026-03-08", "01:30", "America/New_York")), "2026-03-08T06:30:00.000Z"); // EST
    assert.equal(iso(zonedInstant("2026-03-08", "02:30", "America/New_York")), "2026-03-08T07:30:00.000Z"); // = 03:30 EDT
    assert.equal(iso(zonedInstant("2026-03-08", "03:30", "America/New_York")), "2026-03-08T07:30:00.000Z"); // EDT
    // London, Sunday 29 March 2026: 01:00 -> 02:00.
    assert.equal(iso(zonedInstant("2026-03-29", "01:30", "Europe/London")), "2026-03-29T01:30:00.000Z");
    assert.equal(iso(zonedInstant("2026-03-29", "08:00", "Europe/London")), "2026-03-29T07:00:00.000Z");
  });

  it("fall back: a time that happens twice uses the first occurrence", () => {
    // New York, Sunday 1 November 2026: 02:00 -> 01:00, so 01:30 happens twice.
    assert.equal(iso(zonedInstant("2026-11-01", "01:30", "America/New_York")), "2026-11-01T05:30:00.000Z"); // EDT, first
    assert.equal(iso(zonedInstant("2026-11-01", "08:00", "America/New_York")), "2026-11-01T13:00:00.000Z"); // EST
    // London, Sunday 25 October 2026.
    assert.equal(iso(zonedInstant("2026-10-25", "01:30", "Europe/London")), "2026-10-25T00:30:00.000Z");
  });

  it("keeps the same wall-clock time across a change (the instant moves, the local time does not)", () => {
    const before = zonedInstant("2026-03-07", "08:00", "America/New_York") as Date;
    const after = zonedInstant("2026-03-09", "08:00", "America/New_York") as Date;
    assert.equal(timeInZone(before, "America/New_York"), "08:00");
    assert.equal(timeInZone(after, "America/New_York"), "08:00");
    assert.equal((after.getTime() - before.getTime()) / 3_600_000, 47); // not 48
  });

  it("southern-hemisphere zones change in the other season", () => {
    assert.equal(iso(zonedInstant("2026-10-04", "08:00", "Australia/Sydney")), "2026-10-03T21:00:00.000Z"); // AEDT started 4 Oct
    assert.equal(iso(zonedInstant("2026-10-03", "08:00", "Australia/Sydney")), "2026-10-02T22:00:00.000Z"); // still AEST
  });
});

describe("date helpers", () => {
  it("dateInZone follows the zone, not the machine", () => {
    const instant = new Date("2026-10-25T20:00:00Z");
    assert.equal(dateInZone(instant, "Asia/Kolkata"), "2026-10-26"); // 01:30 next day
    assert.equal(dateInZone(instant, "America/New_York"), "2026-10-25");
    assert.equal(timeInZone(instant, "Asia/Kolkata"), "01:30");
    assert.equal(timeInZone(new Date("2026-10-25T18:30:00Z"), "Asia/Kolkata"), "00:00"); // midnight reads 00:00, never 24:00
  });
  it("addDays works on calendar days across month, year and DST boundaries", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  });
  it("validates zone names", () => {
    assert.equal(isValidTimeZone("Asia/Kolkata"), true);
    assert.equal(isValidTimeZone("Nope/Zone"), false);
  });
});
