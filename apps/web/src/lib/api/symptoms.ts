import { request } from "./http";
import type { RuleQuestion, SymptomAssessmentInput, SymptomAssessmentResult } from "./types";

export interface SymptomsApi {
  getQuestions(symptoms: string[]): Promise<RuleQuestion[]>;
  assess(input: SymptomAssessmentInput): Promise<SymptomAssessmentResult>;
}

function unwrapData<T>(res: T | { data: T }): T {
  if (res && typeof res === "object" && "data" in res && (res as { data: T }).data !== undefined) {
    return (res as { data: T }).data;
  }
  return res as T;
}

const liveSymptomsApi: SymptomsApi = {
  getQuestions: async (symptoms: string[]) => {
    const res = await request<{ questions: RuleQuestion[] } | { data: { questions: RuleQuestion[] } }>("/symptoms/questions", {
      method: "POST",
      json: { symptoms },
    });
    const data = unwrapData(res);
    return data.questions || [];
  },
  assess: async (input) => {
    const res = await request<SymptomAssessmentResult | { data: SymptomAssessmentResult }>("/symptoms/assess", {
      method: "POST",
      json: input,
    });
    return unwrapData(res);
  },
};

export const symptomsApi: SymptomsApi = liveSymptomsApi;
