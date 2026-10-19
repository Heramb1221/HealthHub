import { describe, expect, it } from "vitest";
import { evaluateRuleBasedTriage, getRuleBasedQuestions } from "../src/modules/symptoms/service.js";

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

  it("generates targeted rule-based questions for fever and cough symptoms", () => {
    const questions = getRuleBasedQuestions(["Fever", "Cough"]);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(questions.some((q) => q.id === "q_duration")).toBe(true);
    expect(questions.some((q) => q.id === "q_fever_char")).toBe(true);
    expect(questions.some((q) => q.id === "q_resp_char")).toBe(true);
    expect(questions.some((q) => q.id === "q_red_flags")).toBe(true);
  });

  it("evaluates questionnaire answers to deduce Acute Bronchitis and records matched rules", () => {
    const result = evaluateRuleBasedTriage({
      symptoms: ["Cough", "Fever"],
      answers: [
        {
          questionId: "q_duration",
          questionText: "How long have you been experiencing these symptoms?",
          selectedOptionId: "dur_medium",
          selectedOptionLabel: "4 to 7 days",
        },
        {
          questionId: "q_resp_char",
          questionText: "Which best describes your respiratory symptoms?",
          selectedOptionId: "resp_productive",
          selectedOptionLabel: "Loose wet cough with yellow phlegm",
        },
        {
          questionId: "q_red_flags",
          questionText: "Are you experiencing any warning signs?",
          selectedOptionId: "rf_none",
          selectedOptionLabel: "None of these",
        },
      ],
    });

    expect(result.urgency).toBe("urgent");
    expect(result.possibleExplanations[0]?.condition).toContain("Bronchitis");
    expect(result.matchedRules?.some((r) => r.ruleName === "Productive Cough Rule")).toBe(true);
  });

  it("escalates to emergency if questionnaire answer indicates acute coronary event", () => {
    const result = evaluateRuleBasedTriage({
      symptoms: ["Chest tightness"],
      answers: [
        {
          questionId: "q_resp_char",
          questionText: "Which best describes your chest symptoms?",
          selectedOptionId: "resp_chest_heavy",
          selectedOptionLabel: "Heavy crushing pressure radiating to arm",
        },
      ],
    });

    expect(result.urgency).toBe("emergency");
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.matchedRules?.some((r) => r.ruleName === "Acute Coronary Syndrome Rule")).toBe(true);
  });
});
