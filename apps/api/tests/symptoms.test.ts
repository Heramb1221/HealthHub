import { describe, expect, it } from "vitest";
import { evaluateRuleBasedTriage } from "../src/modules/symptoms/service.js";

describe("evaluateRuleBasedTriage", () => {
  it("escalates chest pain and arm pain to emergency urgency immediately", () => {
    const result = evaluateRuleBasedTriage({
      symptoms: ["Chest pain", "Left arm pain"],
      description: "Severe pressure feeling on the chest for 30 minutes",
      severity: "severe",
    });

    expect(result.urgency).toBe("emergency");
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.redFlags[0]).toContain("Acute Coronary");
    expect(result.recommendedAction).toContain("Call emergency services");
  });

  it("escalates stroke neurological symptoms to emergency urgency", () => {
    const result = evaluateRuleBasedTriage({
      symptoms: ["Slurred speech", "Face drooping"],
      description: "Sudden weakness on one side of face",
    });

    expect(result.urgency).toBe("emergency");
    expect(result.redFlags.some((f) => f.includes("Stroke"))).toBe(true);
  });

  it("categorizes seasonal fever and cough as routine / outpatient consultation", () => {
    const result = evaluateRuleBasedTriage({
      symptoms: ["Mild fever", "Dry cough"],
      durationDays: 2,
      severity: "mild",
    });

    expect(result.urgency).toBe("routine");
    expect(result.redFlags).toHaveLength(0);
    expect(result.possibleExplanations.some((e) => e.condition.includes("Respiratory"))).toBe(true);
  });

  it("always includes non-diagnosis disclaimer", () => {
    const result = evaluateRuleBasedTriage({
      symptoms: ["Headache"],
      severity: "mild",
    });

    expect(result.clinicalDisclaimer).toContain("does NOT constitute a medical diagnosis");
  });
});
