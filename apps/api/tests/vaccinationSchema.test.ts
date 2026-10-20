import { describe, expect, it } from "vitest";
import { VACCINE_CATALOG, VACCINE_CATEGORIES } from "../src/modules/vaccinations/catalog.js";
import { recordVaccinationSchema, queryVaccinationsSchema } from "../src/modules/vaccinations/schemas.js";

describe("Vaccine catalog", () => {
  it("contains 31 directory vaccines covering all 4 India categories", () => {
    expect(VACCINE_CATALOG.length).toBe(31);

    const categories = new Set(VACCINE_CATALOG.map((v) => v.category));
    expect(categories.has("uip")).toBe(true);
    expect(categories.has("iap_private")).toBe(true);
    expect(categories.has("covid19")).toBe(true);
    expect(categories.has("special_travel")).toBe(true);

    const uip = VACCINE_CATALOG.filter((v) => v.category === "uip");
    expect(uip.length).toBe(11);

    const iap = VACCINE_CATALOG.filter((v) => v.category === "iap_private");
    expect(iap.length).toBe(6);

    const covid = VACCINE_CATALOG.filter((v) => v.category === "covid19");
    expect(covid.length).toBe(8);

    const travel = VACCINE_CATALOG.filter((v) => v.category === "special_travel");
    expect(travel.length).toBe(6);
  });

  it("has valid category definitions", () => {
    expect(VACCINE_CATEGORIES.length).toBe(5);
  });
});

describe("Vaccination schema validation", () => {
  it("accepts a valid taken record", () => {
    const input = {
      vaccineName: "Covishield",
      vaccineId: "covishield",
      category: "covid19",
      status: "taken",
      administeredDate: "2021-08-14",
      notes: "First and second dose taken",
    };
    const parsed = recordVaccinationSchema.parse(input);
    expect(parsed.vaccineName).toBe("Covishield");
    expect(parsed.status).toBe("taken");
  });

  it("accepts a valid not_taken record", () => {
    const input = {
      vaccineName: "Yellow Fever Vaccine",
      status: "not_taken",
    };
    const parsed = recordVaccinationSchema.parse(input);
    expect(parsed.status).toBe("not_taken");
    expect(parsed.category).toBe("custom");
  });

  it("rejects invalid status", () => {
    expect(() =>
      recordVaccinationSchema.parse({
        vaccineName: "BCG",
        status: "maybe",
      }),
    ).toThrow();
  });

  it("rejects future date", () => {
    const futureDate = "2099-01-01";
    expect(() =>
      recordVaccinationSchema.parse({
        vaccineName: "BCG",
        status: "taken",
        administeredDate: futureDate,
      }),
    ).toThrow();
  });

  it("rejects control characters in vaccineName or notes", () => {
    expect(() =>
      recordVaccinationSchema.parse({
        vaccineName: "BCG\u0000injection",
        status: "taken",
      }),
    ).toThrow();
  });

  it("validates query parameters", () => {
    expect(queryVaccinationsSchema.parse({ category: "uip", status: "taken" })).toEqual({
      category: "uip",
      status: "taken",
    });
  });
});
