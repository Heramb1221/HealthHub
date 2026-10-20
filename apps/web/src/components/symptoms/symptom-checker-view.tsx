"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  Info,
  LoaderCircle,
  PhoneCall,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeError } from "@/lib/api/errors";
import { symptomsApi } from "@/lib/api/symptoms";
import type {
  PossibleExplanation,
  RuleQuestion,
  SymptomAnswer,
  SymptomAssessmentResult,
  TriageUrgency,
} from "@/lib/api/types";

const COMMON_SYMPTOMS = [
  "Fever",
  "Cough",
  "Headache",
  "Sore throat",
  "Fatigue",
  "Abdominal pain",
  "Shortness of breath",
  "Chest tightness",
  "Nausea",
  "Dizziness",
  "Back pain",
  "Joint pain",
  "Skin rash",
  "Loss of appetite",
  "Chills",
];

type Step = "select_symptoms" | "questionnaire" | "results";

export function SymptomCheckerView() {
  const [step, setStep] = React.useState<Step>("select_symptoms");
  const [symptoms, setSymptoms] = React.useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = React.useState("");
  const [patientAge, setPatientAge] = React.useState<number | "">(30);
  const [description, setDescription] = React.useState("");

  const [questions, setQuestions] = React.useState<RuleQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, { optionId: string; optionLabel: string; isRedFlag?: boolean }>>({});
  const [loadingQuestions, setLoadingQuestions] = React.useState(false);

  const [evaluating, setEvaluating] = React.useState(false);
  const [result, setResult] = React.useState<SymptomAssessmentResult | null>(null);
  const [showAnswersRecap, setShowAnswersRecap] = React.useState(false);

  function handleAddSymptom(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (symptoms.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      toast.info(`"${trimmed}" is already added.`);
      return;
    }
    if (symptoms.length >= 10) {
      toast.error("Maximum of 10 symptoms can be assessed at once.");
      return;
    }
    setSymptoms([...symptoms, trimmed]);
    setCustomSymptom("");
  }

  function handleRemoveSymptom(name: string) {
    setSymptoms(symptoms.filter((s) => s !== name));
  }

  async function handleStartQuestionnaire() {
    if (symptoms.length === 0) {
      toast.error("Please add at least one symptom to start the assessment.");
      return;
    }

    setLoadingQuestions(true);
    try {
      const fetchedQuestions = await symptomsApi.getQuestions(symptoms);
      if (!fetchedQuestions || fetchedQuestions.length === 0) {
        throw new Error("No questionnaire generated");
      }
      setQuestions(fetchedQuestions);
      setCurrentQuestionIdx(0);
      setAnswers({});
      setStep("questionnaire");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {

      const fallbackQuestions: RuleQuestion[] = [
        {
          id: "q_duration",
          category: "duration",
          question: "How long have you been experiencing these symptoms?",
          subtext: "Clinical duration helps separate acute self-limiting episodes from subacute or progressive infections.",
          options: [
            { id: "dur_acute", label: "Less than 24 hours (acute onset)" },
            { id: "dur_short", label: "1 to 3 days (developing)" },
            { id: "dur_medium", label: "4 to 7 days (persisting for nearly a week)" },
            { id: "dur_chronic", label: "More than 1 week (persistent or recurring)" },
          ],
        },
        {
          id: "q_progression",
          category: "characteristics",
          question: "How is the overall discomfort progressing?",
          subtext: "Understanding the clinical trajectory aids in determining urgency level.",
          options: [
            { id: "prog_mild", label: "Mild and manageable, daily routine uninterrupted" },
            { id: "prog_stable", label: "Moderate discomfort, noticeable but stable" },
            { id: "prog_worsening", label: "Rapidly worsening or spreading today" },
            { id: "prog_intermittent", label: "Comes and goes in waves or spasms" },
          ],
        },
        {
          id: "q_red_flags",
          category: "red_flags",
          question: "Are you experiencing any of these critical emergency warning signs?",
          subtext: "Clinical safety screener: please answer accurately.",
          options: [
            { id: "rf_breathing", label: "Severe shortness of breath, gasping, or bluish lips/fingertips", isRedFlag: true },
            { id: "rf_neuro", label: "Sudden facial drooping, arm weakness, or slurred speech", isRedFlag: true },
            { id: "rf_bleeding", label: "Vomiting blood, coughing up blood, or black tarry stools", isRedFlag: true },
            { id: "rf_none", label: "None of these warning signs are present" },
          ],
        },
      ];
      setQuestions(fallbackQuestions);
      setCurrentQuestionIdx(0);
      setAnswers({});
      setStep("questionnaire");
    } finally {
      setLoadingQuestions(false);
    }
  }

  function handleSelectOption(questionId: string, optionId: string, optionLabel: string, isRedFlag?: boolean) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { optionId, optionLabel, isRedFlag },
    }));
  }

  async function handleCompleteAssessment() {
    setEvaluating(true);
    try {
      const formattedAnswers: SymptomAnswer[] = questions
        .filter((q) => answers[q.id])
        .map((q) => ({
          questionId: q.id,
          questionText: q.question,
          selectedOptionId: answers[q.id]!.optionId,
          selectedOptionLabel: answers[q.id]!.optionLabel,
        }));

      const res = await symptomsApi.assess({
        symptoms,
        patientAge: typeof patientAge === "number" ? patientAge : undefined,
        description: description.trim() || undefined,
        answers: formattedAnswers,
      });

      setResult(res);
      setStep("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setEvaluating(false);
    }
  }

  function handleReset() {
    setSymptoms([]);
    setCustomSymptom("");
    setDescription("");
    setQuestions([]);
    setCurrentQuestionIdx(0);
    setAnswers({});
    setResult(null);
    setStep("select_symptoms");
  }

  const urgencyConfig: Record<
    TriageUrgency,
    { label: string; tone: "danger" | "warning" | "info" | "success"; border: string; bg: string; icon: typeof AlertCircle }
  > = {
    emergency: {
      label: "Emergency Care Required",
      tone: "danger",
      border: "border-destructive",
      bg: "bg-destructive/10 text-destructive",
      icon: ShieldAlert,
    },
    urgent: {
      label: "Urgent Medical Attention Needed",
      tone: "warning",
      border: "border-amber-500",
      bg: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
      icon: AlertTriangle,
    },
    routine: {
      label: "Routine Clinician Consultation",
      tone: "info",
      border: "border-sky-500",
      bg: "bg-sky-500/10 text-sky-800 dark:text-sky-300",
      icon: Stethoscope,
    },
    self_care: {
      label: "Self-Care & Observation",
      tone: "success",
      border: "border-emerald-500",
      bg: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      icon: CheckCircle2,
    },
  };

  const currentQuestion = questions[currentQuestionIdx];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const hasAnyRedFlag = Object.values(answers).some((a) => a.isRedFlag);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rule-Based Clinical Symptom Checker"
        description="A structured medical triage system that asks targeted questions about your symptoms to screen red flags, deduce differential conditions, and determine urgency."
      />

      <Alert tone="neutral" className="bg-muted/40 border-border">
        <Info className="size-4 text-muted-foreground" />
        <AlertTitle className="text-xs font-semibold">Triage & Decision Support Only</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
          This system uses clinical decision rules for guidance and does NOT provide a definitive diagnosis or replace evaluation by a qualified medical professional.
        </AlertDescription>
      </Alert>

      {step === "select_symptoms" && (
        <div className="bg-card border-border rounded-lg border p-6 shadow-xs space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">1. Select Chief Symptoms</h2>
            <p className="text-muted-foreground text-xs">
              Choose all primary complaints you are experiencing. Our rule engine will generate tailored follow-up questions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {COMMON_SYMPTOMS.map((sym) => {
              const isSelected = symptoms.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => (isSelected ? handleRemoveSymptom(sym) : handleAddSymptom(sym))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-foreground hover:bg-muted"
                  }`}
                >
                  {sym}
                  {isSelected ? <X className="size-3" /> : <Plus className="size-3 opacity-60" />}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-symptom" className="text-xs font-medium">
              Or type a specific symptom
            </Label>
            <div className="flex gap-2">
              <Input
                id="custom-symptom"
                placeholder="Type another symptom (e.g. Swollen ankle, Rash behind ear)..."
                value={customSymptom}
                onChange={(e) => setCustomSymptom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSymptom(customSymptom);
                  }
                }}
                className="text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddSymptom(customSymptom)}
                disabled={!customSymptom.trim()}
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>

          {symptoms.length > 0 && (
            <div className="rounded-lg bg-muted/30 p-3 space-y-2 border">
              <span className="text-muted-foreground text-xs font-medium">
                Selected for Rule Assessment ({symptoms.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {symptoms.map((s) => (
                  <span
                    key={s}
                    className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => handleRemoveSymptom(s)}
                      className="hover:opacity-75"
                    >
                      <X className="size-3" />
                      <span className="sr-only">Remove {s}</span>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
            <div className="space-y-1.5">
              <Label htmlFor="patient-age" className="text-xs font-medium">
                Patient Age (Years)
              </Label>
              <Input
                id="patient-age"
                type="number"
                min={0}
                max={120}
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value === "" ? "" : Number(e.target.value))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-medium">
                Additional Context / Notes (Optional)
              </Label>
              <Input
                id="description"
                placeholder="e.g. Started after traveling; taking blood pressure medicines..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-muted-foreground text-xs">
              {symptoms.length === 0
                ? "Select at least 1 symptom above to begin"
                : `${symptoms.length} symptom${symptoms.length > 1 ? "s" : ""} selected for guided questioning`}
            </p>
            <Button
              type="button"
              disabled={loadingQuestions || symptoms.length === 0}
              onClick={handleStartQuestionnaire}
              className="min-w-56"
            >
              {loadingQuestions ? (
                <>
                  <LoaderCircle className="size-4 animate-spin mr-1.5" />
                  Generating Questions…
                </>
              ) : (
                <>
                  Start Guided Assessment
                  <ArrowRight className="size-4 ml-1.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "questionnaire" && currentQuestion && (
        <div className="space-y-6">

          <div className="bg-card border-border rounded-lg border p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("select_symptoms")}
                className="text-info inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                <ArrowLeft className="size-3.5" /> Edit Symptoms ({symptoms.join(", ")})
              </button>
              <Badge tone="info" className="text-xs uppercase font-semibold">
                Question {currentQuestionIdx + 1} of {questions.length}
              </Badge>
            </div>

            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${((currentQuestionIdx + 1) / questions.length) * 100}%` }}
              />
            </div>

            <div className="pt-2">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                {currentQuestion.category.replace(/_/g, " ")}
              </span>
              <h2 className="text-lg font-semibold text-foreground mt-0.5">
                {currentQuestion.question}
              </h2>
              {currentQuestion.subtext ? (
                <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                  {currentQuestion.subtext}
                </p>
              ) : null}
            </div>

            <div className="space-y-2.5 pt-2">
              {currentQuestion.options.map((opt) => {
                const isSelected = currentAnswer?.optionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      handleSelectOption(currentQuestion.id, opt.id, opt.label, opt.isRedFlag)
                    }
                    className={`w-full text-left rounded-lg border p-4 transition-all flex items-start gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "border-border hover:bg-muted/40 hover:border-foreground/20"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected ? <CheckCircle2 className="size-3.5" /> : null}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-sm ${isSelected ? "font-semibold text-foreground" : "text-foreground/90"}`}>
                          {opt.label}
                        </span>
                        {opt.isRedFlag ? (
                          <Badge tone="danger" className="text-[10px]">
                            High Priority Warning Sign
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {hasAnyRedFlag && (
              <Alert tone="danger" className="mt-4">
                <AlertCircle className="size-5" />
                <AlertTitle className="text-sm font-semibold">Immediate Emergency Sign Detected</AlertTitle>
                <AlertDescription className="text-xs">
                  One or more responses indicated an acute emergency warning sign. If the patient is experiencing active chest crushing pain, breathing failure, or sudden stroke symptoms, call <strong>112</strong> immediately.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentQuestionIdx((idx) => Math.max(0, idx - 1))}
                disabled={currentQuestionIdx === 0}
              >
                <ArrowLeft className="size-4 mr-1" /> Previous
              </Button>

              {currentQuestionIdx < questions.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCurrentQuestionIdx((idx) => idx + 1)}
                  disabled={!currentAnswer}
                >
                  Next Question <ArrowRight className="size-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCompleteAssessment}
                  disabled={!currentAnswer || evaluating}
                  className="bg-primary hover:bg-primary/90"
                >
                  {evaluating ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin mr-1.5" />
                      Evaluating Rules…
                    </>
                  ) : (
                    <>
                      Complete Assessment & View Output
                      <CheckCircle2 className="size-4 ml-1.5" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "results" && result && (
        <div className="space-y-6">

          <div
            className={`flex flex-col gap-3 rounded-lg border-2 p-6 ${
              urgencyConfig[result.urgency].border
            } ${urgencyConfig[result.urgency].bg}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {React.createElement(urgencyConfig[result.urgency].icon, { className: "size-8 shrink-0" })}
                <div>
                  <h2 className="text-lg font-bold tracking-tight">{result.urgencyLabel}</h2>
                  <p className="text-xs opacity-90">Triage Urgency: {result.urgency.toUpperCase()}</p>
                </div>
              </div>
              <Badge tone={urgencyConfig[result.urgency].tone} className="text-xs uppercase font-bold">
                {result.urgency}
              </Badge>
            </div>
            <p className="mt-1 text-sm font-medium leading-relaxed">{result.recommendedAction}</p>

            {result.urgency === "emergency" && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href="tel:112"
                  className="bg-destructive hover:bg-destructive/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-xs"
                >
                  <PhoneCall className="size-4" /> Call 112 (National Emergency)
                </a>
                <a
                  href="tel:108"
                  className="border-destructive text-destructive hover:bg-destructive/10 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold shadow-xs"
                >
                  <PhoneCall className="size-4" /> Call 108 (Ambulance)
                </a>
              </div>
            )}
          </div>

          {result.redFlags && result.redFlags.length > 0 ? (
            <Alert tone="danger">
              <AlertCircle className="size-5" />
              <AlertTitle className="text-base font-semibold">Critical Red Flags Triggered</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  {result.redFlags.map((flag, idx) => (
                    <li key={idx} className="font-medium">
                      {flag}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-lg border p-4 flex items-center gap-3">
              <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs">
                <strong className="block font-semibold text-sm">Emergency Red Flags Ruled Out</strong>
                No immediate acute life-threatening red flags were identified from your questionnaire answers.
              </div>
            </div>
          )}

          <div className="bg-card border-border space-y-4 rounded-lg border p-6 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="text-primary size-5" />
                <h3 className="text-base font-semibold text-foreground">
                  Rule-Based Differential Considerations (Possible Conditions)
                </h3>
              </div>
              <span className="text-muted-foreground text-xs font-medium">
                Delineated via clinical decision rules
              </span>
            </div>

            {result.possibleExplanations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No standard clinical pattern matched. Please consult a general physician for an in-person physical examination.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {result.possibleExplanations.map((exp: PossibleExplanation, idx: number) => {
                  const likelihoodTone: Record<string, "danger" | "warning" | "info" | "neutral"> = {
                    high: "danger",
                    moderate: "warning",
                    low: "neutral",
                    possible: "info",
                  };

                  const matchedRule = result.matchedRules?.find((r) =>
                    exp.condition.toLowerCase().includes(r.condition.toLowerCase()) ||
                    r.condition.toLowerCase().includes(exp.condition.toLowerCase())
                  );

                  return (
                    <div
                      key={idx}
                      className="border-border bg-background space-y-3 rounded-lg border p-4 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{exp.condition}</h4>
                        <Badge tone={likelihoodTone[exp.likelihood] ?? "neutral"} className="text-xs">
                          {exp.likelihood} likelihood
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs leading-relaxed">{exp.description}</p>

                      {matchedRule ? (
                        <div className="bg-muted/50 rounded-md p-2.5 text-[11px] border">
                          <span className="font-semibold text-foreground block">
                            Triggered Rule: {matchedRule.ruleName}
                          </span>
                          <span className="text-muted-foreground">{matchedRule.reason}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {result.answeredQuestions && result.answeredQuestions.length > 0 && (
            <div className="bg-card border-border rounded-lg border p-6 shadow-xs space-y-3">
              <button
                type="button"
                onClick={() => setShowAnswersRecap(!showAnswersRecap)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <FileText className="text-primary size-5" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Questionnaire Answers Summary ({result.answeredQuestions.length} questions answered)
                  </h3>
                </div>
                {showAnswersRecap ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </button>

              {showAnswersRecap && (
                <div className="divide-y pt-2 border-t">
                  {result.answeredQuestions.map((ans, idx) => (
                    <div key={idx} className="py-2.5 text-xs first:pt-1">
                      <p className="font-medium text-foreground">{ans.questionText}</p>
                      <p className="text-primary font-semibold mt-0.5">↳ {ans.selectedOptionLabel}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.followUpQuestions && result.followUpQuestions.length > 0 && (
            <div className="bg-card border-border space-y-3 rounded-lg border p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <HelpCircle className="text-primary size-5" />
                <h3 className="text-sm font-semibold text-foreground">Questions to Discuss with Your Doctor</h3>
              </div>
              <ul className="text-muted-foreground space-y-1.5 text-xs">
                {result.followUpQuestions.map((q, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ArrowRight className="text-primary mt-0.5 size-3 shrink-0" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-primary/5 border-primary/20 rounded-lg border p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Need a Formal In-Person Consultation?</h3>
              <p className="text-muted-foreground text-xs">
                Book a verified consultation slot at accredited hospitals in Mumbai, Delhi, Bengaluru, and Pune.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button asChild size="sm">
                <Link href="/hospitals">
                  <Stethoscope className="size-4 mr-1.5" /> Book Hospital Slot
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="size-4 mr-1.5" /> New Assessment
              </Button>
            </div>
          </div>

          <div className="border-border bg-muted/30 rounded-md border p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Clinical Safety Disclaimer</p>
            {result.clinicalDisclaimer}
          </div>
        </div>
      )}
    </div>
  );
}
