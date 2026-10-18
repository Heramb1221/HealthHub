import { describe, expect, it } from "vitest";
import {
  createFamilyMemberSchema,
  getGeneration,
  RELATIONSHIP_LABELS,
  updateFamilyMemberSchema,
  FAMILY_RELATIONSHIPS,
  BLOOD_GROUPS,
  VITAL_STATUSES,
} from "../src/modules/family/schemas.js";

describe("Family generation mapping", () => {
  it("maps grandparents to grandparent generation", () => {
    expect(getGeneration("maternal_grandfather")).toBe("grandparents");
    expect(getGeneration("maternal_grandmother")).toBe("grandparents");
    expect(getGeneration("paternal_grandfather")).toBe("grandparents");
    expect(getGeneration("paternal_grandmother")).toBe("grandparents");
  });

  it("maps parents to parents generation", () => {
    expect(getGeneration("father")).toBe("parents");
    expect(getGeneration("mother")).toBe("parents");
  });

  it("maps siblings and spouse to current generation", () => {
    expect(getGeneration("brother")).toBe("current");
    expect(getGeneration("sister")).toBe("current");
    expect(getGeneration("spouse")).toBe("current");
  });

  it("maps children to children generation", () => {
    expect(getGeneration("son")).toBe("children");
    expect(getGeneration("daughter")).toBe("children");
  });

  it("maps other to other generation", () => {
    expect(getGeneration("other")).toBe("other");
  });

  it("has a human readable label for every relationship", () => {
    for (const rel of FAMILY_RELATIONSHIPS) {
      expect(RELATIONSHIP_LABELS[rel]).toBeDefined();
      expect(RELATIONSHIP_LABELS[rel].length).toBeGreaterThan(0);
    }
  });

  it("defines standard vital statuses and blood groups", () => {
    expect(VITAL_STATUSES).toEqual(["alive", "deceased", "unknown"]);
    expect(BLOOD_GROUPS).toContain("O+");
    expect(BLOOD_GROUPS).toContain("B+");
  });
});

describe("Family member schema validation", () => {
  it("accepts a valid living family member", () => {
    const input = {
      fullName: "Ramesh Sharma",
      relationship: "father",
      vitalStatus: "alive",
      age: 58,
      bloodGroup: "B+",
      conditions: ["Type 2 Diabetes", "Hypertension"],
      notes: "Diagnosed at age 45, on Metformin",
    };
    const parsed = createFamilyMemberSchema.parse(input);
    expect(parsed.fullName).toBe("Ramesh Sharma");
    expect(parsed.relationship).toBe("father");
    expect(parsed.vitalStatus).toBe("alive");
    expect(parsed.age).toBe(58);
    expect(parsed.conditions).toEqual(["Type 2 Diabetes", "Hypertension"]);
  });

  it("accepts a deceased family member with age and conditions", () => {
    const input = {
      fullName: "Savitri Devi",
      relationship: "maternal_grandmother",
      vitalStatus: "deceased",
      age: 82,
      conditions: ["Coronary Artery Disease"],
      notes: "Passed away due to heart failure",
    };
    const parsed = createFamilyMemberSchema.parse(input);
    expect(parsed.vitalStatus).toBe("deceased");
    expect(parsed.age).toBe(82);
    expect(parsed.notes).toBe("Passed away due to heart failure");
  });

  it("rejects invalid blood group", () => {
    expect(() =>
      createFamilyMemberSchema.parse({
        fullName: "Test Relative",
        relationship: "brother",
        bloodGroup: "C+",
      }),
    ).toThrow();
  });

  it("rejects invalid age (> 130 or negative)", () => {
    expect(() =>
      createFamilyMemberSchema.parse({
        fullName: "Test Relative",
        relationship: "brother",
        age: 150,
      }),
    ).toThrow();

    expect(() =>
      createFamilyMemberSchema.parse({
        fullName: "Test Relative",
        relationship: "brother",
        age: -5,
      }),
    ).toThrow();
  });

  it("rejects control characters in names or notes", () => {
    expect(() =>
      createFamilyMemberSchema.parse({
        fullName: "Bad\u0000Name",
        relationship: "brother",
      }),
    ).toThrow();

    expect(() =>
      createFamilyMemberSchema.parse({
        fullName: "Valid Name",
        relationship: "brother",
        notes: "Note with \u0007 bell character",
      }),
    ).toThrow();
  });

  it("validates update schema with partial fields", () => {
    const update = updateFamilyMemberSchema.parse({
      vitalStatus: "deceased",
      age: 75,
      notes: "Passed away peacefully",
    });
    expect(update.vitalStatus).toBe("deceased");
    expect(update.age).toBe(75);
  });

  it("rejects empty object update", () => {
    expect(() => updateFamilyMemberSchema.parse({})).toThrow();
  });
});
