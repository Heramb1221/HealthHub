import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ageProblem,
  buildAnswerPayload,
  canAdvance,
  hasRedFlag,
  isLastQuestion,
  progressPercent,
  symptomProblem,
  unansweredQuestions,
  type AnswerMap,
  type QuestionLike,
} from "../src/lib/symptoms/questionnaire";

const qs: QuestionLike[] = [
  { id: "q1", question: "How long?", options: [{ id: "a", label: "Short" }, { id: "b", label: "Long" }] },
  { id: "q2", question: "Red flags?", options: [{ id: "x", label: "Breathless", isRedFlag: true }, { id: "n", label: "None" }] },
];

describe("final step detection", () => {
  it("knows which question is last, including a single-question set", () => {
    assert.equal(isLastQuestion(0, 2), false);
    assert.equal(isLastQuestion(1, 2), true);
    assert.equal(isLastQuestion(0, 1), true);
    assert.equal(isLastQuestion(0, 0), false);
  });
  it("progress never exceeds 100 or goes negative", () => {
    assert.equal(progressPercent(0, 4), 25);
    assert.equal(progressPercent(3, 4), 100);
    assert.equal(progressPercent(9, 4), 100);
    assert.equal(progressPercent(0, 0), 0);
  });
});

describe("answers", () => {
  it("canAdvance only when the current question is answered", () => {
    const answers: AnswerMap = { q1: { optionId: "a", optionLabel: "Short" } };
    assert.equal(canAdvance(qs[0], answers), true);
    assert.equal(canAdvance(qs[1], answers), false);
    assert.equal(canAdvance(undefined, answers), false);
  });
  it("lists unanswered questions in order", () => {
    assert.deepEqual(unansweredQuestions(qs, { q2: { optionId: "n", optionLabel: "None" } }).map((q) => q.id), ["q1"]);
  });
  it("builds the payload from the question's own option labels and drops unknown options", () => {
    const payload = buildAnswerPayload(qs, {
      q1: { optionId: "b", optionLabel: "tampered label" },
      q2: { optionId: "gone", optionLabel: "stale" },
    });
    assert.deepEqual(payload, [{ questionId: "q1", questionText: "How long?", selectedOptionId: "b", selectedOptionLabel: "Long" }]);
  });
  it("detects red flags", () => {
    assert.equal(hasRedFlag({ q2: { optionId: "x", optionLabel: "Breathless", isRedFlag: true } }), true);
    assert.equal(hasRedFlag({ q2: { optionId: "n", optionLabel: "None" } }), false);
  });
});

describe("field validation", () => {
  it("validates age", () => {
    assert.equal(ageProblem(""), null);
    assert.equal(ageProblem(0), null);
    assert.equal(ageProblem(120), null);
    assert.ok(ageProblem(121));
    assert.ok(ageProblem(-1));
    assert.ok(ageProblem(30.5));
    assert.ok(ageProblem(Number.NaN));
  });
  it("validates custom symptoms", () => {
    assert.ok(symptomProblem("  ", []));
    assert.ok(symptomProblem("x".repeat(101), []));
    assert.match(symptomProblem("Fever", ["fever"]) ?? "", /already added/);
    assert.ok(symptomProblem("new", Array.from({ length: 10 }, (_, i) => `s${i}`)));
    assert.equal(symptomProblem("Swollen ankle", ["Fever"]), null);
  });
});
