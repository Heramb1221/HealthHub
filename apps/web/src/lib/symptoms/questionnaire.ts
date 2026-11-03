/**
 * Pure logic for the guided symptom questionnaire, kept free of React so it can be unit-tested.
 * Nothing here invents clinical content: questions always come from the API.
 */

export interface QuestionOption {
  id: string;
  label: string;
  isRedFlag?: boolean;
}

export interface QuestionLike {
  id: string;
  question: string;
  options: QuestionOption[];
}

export type AnswerMap = Record<string, { optionId: string; optionLabel: string; isRedFlag?: boolean }>;

export const AGE_MIN = 0;
export const AGE_MAX = 120;
export const MAX_SYMPTOMS = 10;
export const MAX_SYMPTOM_LENGTH = 100;

export function isLastQuestion(index: number, total: number): boolean {
  return total > 0 && index >= total - 1;
}

/** Percent complete for the progress bar, counting the current question as in progress. */
export function progressPercent(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((index + 1) / total) * 100)));
}

/** Returns an error message for the age field, or null when it is valid or intentionally blank. */
export function ageProblem(value: number | ""): string | null {
  if (value === "") return null;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return "Enter the age as a whole number of years.";
  if (value < AGE_MIN || value > AGE_MAX) return `Age must be between ${AGE_MIN} and ${AGE_MAX}.`;
  return null;
}

/** Returns an error message for a custom symptom, or null. */
export function symptomProblem(name: string, existing: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Type a symptom first.";
  if (trimmed.length > MAX_SYMPTOM_LENGTH) return `Keep each symptom under ${MAX_SYMPTOM_LENGTH} characters.`;
  if (existing.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return `"${trimmed}" is already added.`;
  if (existing.length >= MAX_SYMPTOMS) return `You can assess at most ${MAX_SYMPTOMS} symptoms at once.`;
  return null;
}

/** Questions that still have no selected answer, in order. */
export function unansweredQuestions<Q extends QuestionLike>(questions: Q[], answers: AnswerMap): Q[] {
  return questions.filter((q) => !answers[q.id]);
}

export function canAdvance(question: QuestionLike | undefined, answers: AnswerMap): boolean {
  return Boolean(question && answers[question.id]);
}

/**
 * Answers sent to the API: only questions that were actually answered, and only options that exist
 * on that question (a stale answer for a changed question set is dropped rather than sent).
 */
export function buildAnswerPayload<Q extends QuestionLike>(questions: Q[], answers: AnswerMap) {
  const out: { questionId: string; questionText: string; selectedOptionId: string; selectedOptionLabel: string }[] = [];
  for (const q of questions) {
    const a = answers[q.id];
    if (!a) continue;
    const option = q.options.find((o) => o.id === a.optionId);
    if (!option) continue;
    out.push({ questionId: q.id, questionText: q.question, selectedOptionId: option.id, selectedOptionLabel: option.label });
  }
  return out;
}

export function hasRedFlag(answers: AnswerMap): boolean {
  return Object.values(answers).some((a) => a.isRedFlag);
}
