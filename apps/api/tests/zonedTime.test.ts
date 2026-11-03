import { describe, expect, it } from "vitest";
import { addDays, dateInZone, isValidTimeZone, timeInZone, zonedInstant } from "../src/lib/zonedTime.js";

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("zonedInstant: ordinary days", () => {
  it("converts wall-clock time in a zone to the right instant", () => {
    expect(iso(zonedInstant("2026-10-25", "08:00", "Asia/Kolkata"))).toBe("2026-10-25T02:30:00.000Z");
    expect(iso(zonedInstant("2026-10-25", "20:00", "Asia/Kolkata"))).toBe("2026-10-25T14:30:00.000Z");
    expect(iso(zonedInstant("2026-01-15", "08:00", "America/New_York"))).toBe("2026-01-15T13:00:00.000Z");
    expect(iso(zonedInstant("2026-07-15", "08:00", "America/New_York"))).toBe("2026-07-15T12:00:00.000Z");
    expect(iso(zonedInstant("2026-07-15", "08:00", "UTC"))).toBe("2026-07-15T08:00:00.000Z");
    expect(iso(zonedInstant("2026-07-15", "23:59", "Pacific/Auckland"))).toBe("2026-07-15T11:59:00.000Z");
  });

  it("handles half-hour and 45-minute zones and midnight", () => {
    expect(iso(zonedInstant("2026-10-25", "00:00", "Asia/Kolkata"))).toBe("2026-10-24T18:30:00.000Z");
    expect(iso(zonedInstant("2026-10-25", "12:00", "Asia/Kathmandu"))).toBe("2026-10-25T06:15:00.000Z");
  });

  it("rejects malformed input instead of guessing", () => {
    for (const [d, t, z] of [["2026-02-30", "08:00", "UTC"], ["2026-13-01", "08:00", "UTC"], ["2026-10-25", "24:00", "UTC"], ["2026-10-25", "8:00", "UTC"], ["2026-10-25", "08:00", "Not/AZone"], ["", "", ""]] as const) {
      expect(zonedInstant(d, t, z), `${d} ${t} ${z}`).toBeNull();
    }
  });
});

describe("zonedInstant: daylight-saving changes", () => {
  it("spring forward: a time that does not exist moves to the first valid moment that day", () => {
    // New York, Sunday 8 March 2026: clocks jump from 02:00 to 03:00.
    expect(iso(zonedInstant("2026-03-08", "01:30", "America/New_York"))).toBe("2026-03-08T06:30:00.000Z"); // EST
    expect(iso(zonedInstant("2026-03-08", "02:30", "America/New_York"))).toBe("2026-03-08T07:30:00.000Z"); // = 03:30 EDT
    expect(iso(zonedInstant("2026-03-08", "03:30", "America/New_York"))).toBe("2026-03-08T07:30:00.000Z"); // EDT
    // London, Sunday 29 March 2026: 01:00 -> 02:00.
    expect(iso(zonedInstant("2026-03-29", "01:30", "Europe/London"))).toBe("2026-03-29T01:30:00.000Z");
    expect(iso(zonedInstant("2026-03-29", "08:00", "Europe/London"))).toBe("2026-03-29T07:00:00.000Z");
  });

  it("fall back: a time that happens twice uses the first occurrence", () => {
    // New York, Sunday 1 November 2026: 02:00 -> 01:00, so 01:30 happens twice.
    expect(iso(zonedInstant("2026-11-01", "01:30", "America/New_York"))).toBe("2026-11-01T05:30:00.000Z"); // EDT, first
    expect(iso(zonedInstant("2026-11-01", "08:00", "America/New_York"))).toBe("2026-11-01T13:00:00.000Z"); // EST
    // London, Sunday 25 October 2026.
    expect(iso(zonedInstant("2026-10-25", "01:30", "Europe/London"))).toBe("2026-10-25T00:30:00.000Z");
  });

  it("keeps the same wall-clock time across a change (the instant moves, the local time does not)", () => {
    const before = zonedInstant("2026-03-07", "08:00", "America/New_York") as Date;
    const after = zonedInstant("2026-03-09", "08:00", "America/New_York") as Date;
    expect(timeInZone(before, "America/New_York")).toBe("08:00");
    expect(timeInZone(after, "America/New_York")).toBe("08:00");
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(47); // not 48
  });

  it("southern-hemisphere zones change in the other season", () => {
    expect(iso(zonedInstant("2026-10-04", "08:00", "Australia/Sydney"))).toBe("2026-10-03T21:00:00.000Z"); // AEDT started 4 Oct
    expect(iso(zonedInstant("2026-10-03", "08:00", "Australia/Sydney"))).toBe("2026-10-02T22:00:00.000Z"); // still AEST
  });
});

describe("date helpers", () => {
  it("dateInZone follows the zone, not the machine", () => {
    const instant = new Date("2026-10-25T20:00:00Z");
    expect(dateInZone(instant, "Asia/Kolkata")).toBe("2026-10-26"); // 01:30 next day
    expect(dateInZone(instant, "America/New_York")).toBe("2026-10-25");
    expect(timeInZone(instant, "Asia/Kolkata")).toBe("01:30");
    expect(timeInZone(new Date("2026-10-25T18:30:00Z"), "Asia/Kolkata")).toBe("00:00"); // midnight reads 00:00, never 24:00
  });
  it("addDays works on calendar days across month, year and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
  it("validates zone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Nope/Zone")).toBe(false);
  });
});
