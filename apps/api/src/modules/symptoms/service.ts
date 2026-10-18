import type { Env } from "../../config/env.js";
import { log } from "../../lib/logger.js";

export type TriageUrgency = "emergency" | "urgent" | "routine" | "self_care";

export interface SymptomAssessmentInput {
  symptoms: string[];
  description?: string;
  durationDays?: number;
  severity?: "mild" | "moderate" | "severe";
  patientAge?: number;
}

export interface PossibleExplanation {
  condition: string;
  likelihood: "high" | "moderate" | "low" | "possible";
  description: string;
}

export interface SymptomAssessmentResult {
  urgency: TriageUrgency;
  urgencyLabel: string;
  redFlags: string[];
  possibleExplanations: PossibleExplanation[];
  recommendedAction: string;
  followUpQuestions: string[];
  clinicalDisclaimer: string;
  analyzedAt: string;
  provider: "clinical_rules" | "gemini_triage";
}

const CLINICAL_DISCLAIMER =
  "Safety Notice & Medical Disclaimer: This symptom assessment tool provides automated informational triage only and does NOT constitute a medical diagnosis, clinical opinion, or treatment prescription. If you are experiencing severe, sudden, or life-threatening symptoms, immediately call emergency services (112 / 108 in India) or visit the nearest hospital emergency department.";

interface RedFlagRule {
  keywords: string[];
  flag: string;
  action: string;
}

const RED_FLAG_RULES: RedFlagRule[] = [
  {
    keywords: ["chest pain", "chest pressure", "heart attack", "left arm pain", "chest tightness"],
    flag: "Potential Acute Coronary / Cardiac Event: Unexplained chest pressure or pain radiating to arm/jaw.",
    action: "Call emergency services (112) or go to the nearest emergency department immediately.",
  },
  {
    keywords: ["difficulty breathing", "shortness of breath", "can't breathe", "suffocation", "gasping"],
    flag: "Severe Respiratory Distress: Impaired oxygenation or breathing difficulty.",
    action: "Seek immediate emergency medical attention or visit emergency room right now.",
  },
  {
    keywords: ["slurred speech", "face drooping", "arm weakness", "paralysis", "stroke"],
    flag: "Acute Neurological / Stroke Signs (FAST): Sudden weakness, facial drooping, or speech difficulty.",
    action: "Call emergency services immediately. Time-critical emergency.",
  },
  {
    keywords: ["stiff neck", "neck rigidity", "high fever confusion", "altered mental"],
    flag: "Meningeal Irritation / Sepsis Risk: High fever coupled with neck stiffness or altered mental state.",
    action: "Visit an emergency room for urgent clinical assessment.",
  },
  {
    keywords: ["vomiting blood", "coughing blood", "blood in stool", "black stool"],
    flag: "Significant Internal / GI Bleeding.",
    action: "Proceed directly to a hospital emergency room.",
  },
  {
    keywords: ["worst headache", "thunderclap headache", "sudden severe headache"],
    flag: "Acute Severe Intracranial Event ('Thunderclap' headache).",
    action: "Emergency medical evaluation needed immediately.",
  },
];

/** Rule-based clinical triage engine */
export function evaluateRuleBasedTriage(input: SymptomAssessmentInput): SymptomAssessmentResult {
  const combinedText = [
    ...(input.symptoms || []),
    input.description || "",
  ].join(" ").toLowerCase();

  const detectedRedFlags: string[] = [];
  let urgentAction = "";

  for (const rule of RED_FLAG_RULES) {
    if (rule.keywords.some((k) => combinedText.includes(k))) {
      detectedRedFlags.push(rule.flag);
      if (!urgentAction) urgentAction = rule.action;
    }
  }

  if (detectedRedFlags.length > 0 || input.severity === "severe") {
    return {
      urgency: "emergency",
      urgencyLabel: "Emergency Attention Recommended",
      redFlags: detectedRedFlags.length > 0 ? detectedRedFlags : ["Severe acute symptom severity reported."],
      possibleExplanations: [
        {
          condition: "Acute Clinical Assessment Required",
          likelihood: "high",
          description: "Symptoms require in-person examination by emergency medicine clinicians to rule out acute conditions.",
        },
      ],
      recommendedAction: urgentAction || "Seek immediate medical attention at an emergency clinic or hospital.",
      followUpQuestions: [
        "How long have you had these symptoms?",
        "Do you have a personal history of cardiac, respiratory, or neurological conditions?",
      ],
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
      analyzedAt: new Date().toISOString(),
      provider: "clinical_rules",
    };
  }

  // Moderate / common symptoms rules
  const isFever = combinedText.includes("fever") || combinedText.includes("temperature");
  const isCough = combinedText.includes("cough") || combinedText.includes("throat") || combinedText.includes("cold");
  const isAbdominal = combinedText.includes("stomach") || combinedText.includes("abdominal") || combinedText.includes("vomiting") || combinedText.includes("diarrhea");
  const isJointPain = combinedText.includes("joint") || combinedText.includes("knee") || combinedText.includes("back pain");

  const explanations: PossibleExplanation[] = [];
  let urgency: TriageUrgency = "routine";
  let urgencyLabel = "Routine Medical Consultation";
  let recommendedAction = "Schedule an appointment with a general physician for formal evaluation.";

  if (isFever && isCough) {
    explanations.push({
      condition: "Upper Respiratory Tract Infection / Viral Flu",
      likelihood: "high",
      description: "Common seasonal viral or bacterial infection of the airways.",
    });
    explanations.push({
      condition: "Acute Bronchitis",
      likelihood: "moderate",
      description: "Inflammation of the bronchial tubes, commonly presenting with persistent cough and low fever.",
    });
    if ((input.durationDays ?? 0) > 3) {
      urgency = "urgent";
      urgencyLabel = "Urgent Outpatient Review";
      recommendedAction = "Consult a physician within 24 hours for chest auscultation and proper medication.";
    }
  } else if (isAbdominal) {
    explanations.push({
      condition: "Acute Gastroenteritis / Dyspepsia",
      likelihood: "moderate",
      description: "Irritation of the digestive tract, food-borne illness, or acid reflux.",
    });
    recommendedAction = "Maintain adequate hydration with oral rehydration solution (ORS). Consult a doctor if vomiting persists.";
  } else if (isJointPain) {
    explanations.push({
      condition: "Musculoskeletal Strain / Arthralgia",
      likelihood: "moderate",
      description: "Mechanical strain, overuse, or mild inflammatory joint discomfort.",
    });
    urgency = "routine";
    recommendedAction = "Rest the affected joint. Consult an orthopedic specialist or physiotherapist if pain lasts over a week.";
  } else {
    explanations.push({
      condition: "Non-specific Symptom Cluster",
      likelihood: "possible",
      description: "Reported symptoms require a comprehensive clinical history and physical examination.",
    });
  }

  return {
    urgency,
    urgencyLabel,
    redFlags: [],
    possibleExplanations: explanations,
    recommendedAction,
    followUpQuestions: [
      "Have you noticed any triggers that make the discomfort worse or better?",
      "Are you currently taking any prescription medications for this or other conditions?",
    ],
    clinicalDisclaimer: CLINICAL_DISCLAIMER,
    analyzedAt: new Date().toISOString(),
    provider: "clinical_rules",
  };
}

/** Triage powered by Gemini with clinical rule fallback */
export async function assessSymptoms(env: Env, input: SymptomAssessmentInput): Promise<SymptomAssessmentResult> {
  // Always run rule-based check first for emergency red flags
  const fallback = evaluateRuleBasedTriage(input);
  if (fallback.urgency === "emergency") {
    // Never let an AI downgrade a detected clinical red flag
    return fallback;
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || env.EXTRACTION_PROVIDER === "disabled") {
    return fallback;
  }

  try {
    const prompt = `You are a clinical decision-support triage assistant for HealthHub India.
Analyze the following patient-reported symptoms for triage purposes ONLY.
STRICT CLINICAL RULES:
1. You must NEVER give a definitive diagnosis.
2. You must NEVER prescribe medicines, antibiotics, or recommend specific drug dosages.
3. Categorize urgency as one of: "emergency", "urgent", "routine", "self_care".
4. List 2 to 3 plausible medical conditions with likelihood ("high", "moderate", "low", "possible").
5. Provide clear recommended actions (e.g. consult general physician, stay hydrated, seek urgent care).
6. Provide 2 clarifying follow-up questions.
7. Return strictly valid JSON conforming to this schema without Markdown formatting:
{
  "urgency": "emergency" | "urgent" | "routine" | "self_care",
  "urgencyLabel": string,
  "redFlags": string[],
  "possibleExplanations": [
    { "condition": string, "likelihood": "high" | "moderate" | "low" | "possible", "description": string }
  ],
  "recommendedAction": string,
  "followUpQuestions": string[]
}

Patient Symptom Data:
Symptoms: ${input.symptoms.join(", ")}
Description: ${input.description || "None provided"}
Duration: ${input.durationDays ? `${input.durationDays} days` : "Unspecified"}
Severity: ${input.severity || "moderate"}
Age: ${input.patientAge ? `${input.patientAge} years` : "Adult"}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      log("warn", "Gemini triage API call returned non-200, falling back to rule engine", { status: res.status });
      return fallback;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback;

    const parsed = JSON.parse(text) as {
      urgency: TriageUrgency;
      urgencyLabel: string;
      redFlags?: string[];
      possibleExplanations: PossibleExplanation[];
      recommendedAction: string;
      followUpQuestions?: string[];
    };

    return {
      urgency: parsed.urgency || fallback.urgency,
      urgencyLabel: parsed.urgencyLabel || fallback.urgencyLabel,
      redFlags: parsed.redFlags || [],
      possibleExplanations: parsed.possibleExplanations || fallback.possibleExplanations,
      recommendedAction: parsed.recommendedAction || fallback.recommendedAction,
      followUpQuestions: parsed.followUpQuestions || fallback.followUpQuestions,
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
      analyzedAt: new Date().toISOString(),
      provider: "gemini_triage",
    };
  } catch (err) {
    log("warn", "Gemini symptom check error, using deterministic fallback", { error: String(err) });
    return fallback;
  }
}
