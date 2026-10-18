import { describe, expect, it } from "vitest";
import { detectRuleBasedInteractions } from "../src/modules/prescriptions/contraindications.js";

describe("detectRuleBasedInteractions", () => {
  it("detects no interactions for single medication", () => {
    const alerts = detectRuleBasedInteractions([
      { name: "Paracetamol", strength: "500 mg", dose: "1", frequency: "daily" },
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("detects Hyperkalemia interaction between Losartan and Spironolactone", () => {
    const alerts = detectRuleBasedInteractions([
      { name: "Tab. Losartan", strength: "50 mg", dose: "1", frequency: "1-0-1" },
      { name: "Tab. Spironolactone", strength: "25 mg", dose: "1", frequency: "1-0-1" },
    ]);
    expect(alerts.some((a) => a.id === "hyperkalemia-losartan-spironolactone")).toBe(true);
    const hyperkalemiaAlert = alerts.find((a) => a.id === "hyperkalemia-losartan-spironolactone");
    expect(hyperkalemiaAlert?.severity).toBe("high");
  });

  it("detects Triple Whammy when ARB, Diuretic, and NSAID are co-prescribed", () => {
    const alerts = detectRuleBasedInteractions([
      { name: "Losartan 50mg", strength: "50 mg", dose: "1", frequency: "1-0-1" },
      { name: "Spironolactone 25mg", strength: "25 mg", dose: "1", frequency: "1-0-1" },
      { name: "Ibuprofen 400mg", strength: "400 mg", dose: "1", frequency: "1-1-1" },
    ]);
    expect(alerts.some((a) => a.id === "triple-whammy-aki-risk")).toBe(true);
    const tripleWhammy = alerts.find((a) => a.id === "triple-whammy-aki-risk");
    expect(tripleWhammy?.severity).toBe("high");
  });

  it("detects Metformin + NSAID interaction", () => {
    const alerts = detectRuleBasedInteractions([
      { name: "Metformin 500mg", strength: "500 mg", dose: "1", frequency: "1-0-1" },
      { name: "Ibuprofen 400mg", strength: "400 mg", dose: "1", frequency: "1-1-1" },
    ]);
    expect(alerts.some((a) => a.id === "metformin-nsaid-renal-risk")).toBe(true);
  });
});
