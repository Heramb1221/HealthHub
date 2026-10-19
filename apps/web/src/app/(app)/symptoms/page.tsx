import type { Metadata } from "next";

import { SymptomCheckerView } from "@/components/symptoms/symptom-checker-view";

export const metadata: Metadata = {
  title: "AI Symptom Checker",
  description: "Clinical triage and symptom assessment based on clinical rules",
};

export default function SymptomsPage() {
  return <SymptomCheckerView />;
}
