import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import type { Env } from "../../config/env.js";

export type AlertSeverity = "high" | "moderate" | "low";

export interface ContraindicationAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  medications: string[];
  mechanism: string;
  patientAdvice: string;
  clinicalNote: string;
}

export interface ContraindicationReport {
  prescriptionId: string;
  hasInteractions: boolean;
  alerts: ContraindicationAlert[];
  summary: string;
  disclaimer: string;
  analyzedAt: string;
}

const DISCLAIMER =
  "Safety notice: This automated analysis identifies potential drug interactions and precautions from medical literature. It is for informational and screening purposes only and is not medical advice. Never stop, start, or change any prescription without consulting your prescribing physician or pharmacist.";

// In-memory cache keyed by `${prescriptionId}:${updatedAt}`
const reportCache = new Map<string, ContraindicationReport>();

interface MedicationInput {
  name: string | null;
  strength: string | null;
  dose: string | null;
  frequency: string | null;
}

/** Deterministic rule-based interaction detector (runs offline or as fallback). */
export function detectRuleBasedInteractions(medications: MedicationInput[]): ContraindicationAlert[] {
  const alerts: ContraindicationAlert[] = [];
  const names = medications
    .map((m) => (m.name ?? "").toLowerCase().trim())
    .filter((n) => n.length > 0);

  const has = (...keywords: string[]) =>
    names.some((n) => keywords.some((k) => n.includes(k)));

  const isArbOrAce = has("losartan", "telmisartan", "valsartan", "olmesartan", "ramipril", "enalapril", "lisinopril");
  const isPotassiumSparing = has("spironolactone", "eplerenone", "amiloride", "triamterene");
  const isNsaid = has("ibuprofen", "naproxen", "diclofenac", "meloxicam", "indomethacin", "ketorolac");
  const isMetformin = has("metformin");
  const isTramadol = has("tramadol");

  // 1. Triple Whammy: RAAS inhibitor + Diuretic + NSAID
  if (isArbOrAce && isPotassiumSparing && isNsaid) {
    alerts.push({
      id: "triple-whammy-aki-risk",
      severity: "high",
      title: "Critical Renal Risk: RAAS Inhibitor + Diuretic + NSAID ('Triple Whammy')",
      medications: medications
        .filter((m) => {
          const n = (m.name ?? "").toLowerCase();
          return ["losartan", "spironolactone", "ibuprofen", "telmisartan", "ramipril", "diclofenac", "naproxen"].some((k) => n.includes(k));
        })
        .map((m) => m.name ?? "Medication"),
      mechanism:
        "Combining an ARB/ACE-inhibitor with a diuretic and an NSAID significantly impairs renal perfusion and glomerular filtration pressure, posing a severe risk of Acute Kidney Injury (AKI).",
      patientAdvice:
        "Taking this combination of blood pressure medicines and pain relief tablets can put heavy stress on your kidneys. Avoid long-term NSAID pain relief without doctor supervision and report any nausea, reduced urination, or swelling.",
      clinicalNote:
        "High risk of hemodynamically mediated acute renal failure. Recommend evaluating alternative analgesia (e.g. acetaminophen) and monitoring serum creatinine and eGFR.",
    });
  }

  // 2. ARB/ACE + Potassium-Sparing: Hyperkalemia Risk
  if (isArbOrAce && isPotassiumSparing) {
    alerts.push({
      id: "hyperkalemia-losartan-spironolactone",
      severity: "high",
      title: "Hyperkalemia Risk: Dual Potassium Retention",
      medications: medications
        .filter((m) => {
          const n = (m.name ?? "").toLowerCase();
          return ["losartan", "spironolactone", "telmisartan", "eplerenone", "ramipril", "enalapril"].some((k) => n.includes(k));
        })
        .map((m) => m.name ?? "Medication"),
      mechanism:
        "Both ARBs/ACE-inhibitors and aldosterone antagonists reduce urinary potassium excretion through distinct renin-angiotensin-aldosterone pathways, leading to additive hyperkalemia risk.",
      patientAdvice:
        "Both medicines can raise the potassium levels in your blood. Your doctor may check your potassium levels with a simple blood test. Inform your doctor if you experience muscle weakness or irregular heartbeat.",
      clinicalNote:
        "Additive hyperkalemia risk. Serum potassium and renal function monitoring after 1-2 weeks is strongly advised.",
    });
  }

  // 3. NSAID + ARB/ACE: Blood Pressure & Renal Interaction
  if (isNsaid && isArbOrAce && !alerts.some((a) => a.id === "triple-whammy-aki-risk")) {
    alerts.push({
      id: "nsaid-antihypertensive-blunting",
      severity: "moderate",
      title: "Reduced Blood Pressure Control & Renal Caution",
      medications: medications
        .filter((m) => {
          const n = (m.name ?? "").toLowerCase();
          return ["ibuprofen", "naproxen", "diclofenac", "losartan", "telmisartan", "ramipril"].some((k) => n.includes(k));
        })
        .map((m) => m.name ?? "Medication"),
      mechanism:
        "NSAIDs inhibit renal prostaglandins, promoting fluid and sodium retention which antagonizes the blood pressure-lowering effect of ARBs and increases renal vascular resistance.",
      patientAdvice:
        "Pain relievers like ibuprofen can reduce the effectiveness of your blood pressure medicine and increase blood pressure. Keep pain medicine courses as short as possible.",
      clinicalNote:
        "Monitor blood pressure and renal function if NSAID therapy continues beyond short-term use.",
    });
  }

  // 4. Metformin + NSAID
  if (isMetformin && isNsaid) {
    alerts.push({
      id: "metformin-nsaid-renal-risk",
      severity: "moderate",
      title: "Renal Function & Metformin Interaction",
      medications: medications
        .filter((m) => {
          const n = (m.name ?? "").toLowerCase();
          return ["metformin", "ibuprofen", "naproxen", "diclofenac"].some((k) => n.includes(k));
        })
        .map((m) => m.name ?? "Medication"),
      mechanism:
        "NSAID-induced acute reduction in renal clearance can lead to accumulation of metformin, increasing the risk of lactic acidosis especially in dehydrated or elderly patients.",
      patientAdvice:
        "Make sure to stay well hydrated while taking metformin and pain relief. Contact your doctor immediately if you experience severe fatigue, muscle aches, or trouble breathing.",
      clinicalNote:
        "NSAID use should be cautious in diabetic patients taking metformin. Check renal baseline if pain therapy is repeated.",
    });
  }

  // 5. Tramadol precautions
  if (isTramadol && isNsaid) {
    alerts.push({
      id: "tramadol-nsaid-multimodal",
      severity: "low",
      title: "Dual Analgesic Regimen",
      medications: medications
        .filter((m) => {
          const n = (m.name ?? "").toLowerCase();
          return ["tramadol", "ibuprofen"].some((k) => n.includes(k));
        })
        .map((m) => m.name ?? "Medication"),
      mechanism:
        "Tramadol (opioid/serotonergic) and Ibuprofen (NSAID) provide multimodal analgesia with distinct adverse effect profiles.",
      patientAdvice:
        "Take Tramadol strictly as needed (SOS) for severe pain to avoid drowsiness and tolerance. Take Ibuprofen with food to protect your stomach.",
      clinicalNote:
        "Complementary analgesia mechanisms. Advise caution regarding GI mucosal irritation and CNS sedation.",
    });
  }

  return alerts;
}

const GEMINI_ANALYSIS_PROMPT = `You are a clinical pharmacologist assisting in an electronic healthcare system.
Analyze the provided list of prescribed medications and patient conditions for potential drug-drug interactions (DDIs), contraindications, and clinical precautions.

Strict Clinical Rules:
1. Identify all medically significant drug-drug interactions (high, moderate, or low severity).
2. For high severity: combinations known to cause severe adverse events (e.g. hyperkalemia, acute kidney injury / triple whammy, fatal arrhythmias, serotonin syndrome).
3. For moderate severity: combinations that reduce drug efficacy, increase toxicity, or require monitoring (e.g. blunted antihypertensive response, NSAID-induced renal decline).
4. For low severity: mild interactions or helpful multimodal combinations requiring standard precautions.
5. Provide clear, empathetic, non-alarmist plain-language guidance for the patient.
6. Provide a concise clinical note for the prescribing doctor or pharmacist.
7. NEVER tell the patient to stop or change their medications autonomously; always advise discussing with their doctor or pharmacist.

Return the response STRICTLY as a JSON object matching this schema:
{
  "alerts": [
    {
      "id": "kebab-case-unique-identifier",
      "severity": "high" | "moderate" | "low",
      "title": "Short descriptive title",
      "medications": ["Medication A", "Medication B"],
      "mechanism": "Clinical mechanism of interaction",
      "patientAdvice": "Plain language explanation of what the patient needs to know or watch out for",
      "clinicalNote": "Pharmacological note for physician/pharmacist monitoring"
    }
  ],
  "summary": "1-2 sentence overall summary of the safety check"
}`;

async function analyzeWithGemini(
  apiKey: string,
  medications: MedicationInput[],
  patientConditions: string[],
): Promise<{ alerts: ContraindicationAlert[]; summary: string } | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

  const inputPayload = {
    medications: medications.map((m) => ({
      name: m.name,
      strength: m.strength,
      dose: m.dose,
      frequency: m.frequency,
    })),
    knownConditions: patientConditions,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: GEMINI_ANALYSIS_PROMPT },
              { text: `Medications and patient data to analyze:\n${JSON.stringify(inputPayload, null, 2)}` },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as {
      alerts?: ContraindicationAlert[];
      summary?: string;
    };

    if (Array.isArray(parsed.alerts)) {
      return {
        alerts: parsed.alerts,
        summary: parsed.summary ?? "Interaction analysis completed.",
      };
    }
    return null;
  } catch (err) {
    log("warn", "Gemini contraindication analysis failed; falling back to clinical rules", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Checks for drug-drug interactions and contraindications for a prescription.
 */
export async function checkPrescriptionContraindications(
  db: Db,
  prescriptionId: string,
  env: Env,
): Promise<ContraindicationReport> {
  const record = await db.prescriptionRecord.findUnique({
    where: { id: prescriptionId },
    select: {
      id: true,
      updatedAt: true,
      patientId: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          versionNumber: true,
          medications: {
            orderBy: { position: "asc" },
            select: { name: true, strength: true, dose: true, frequency: true },
          },
        },
      },
    },
  });

  if (!record) throw new AppError("NOT_FOUND", "Prescription record not found");

  const latestVersion = record.versions[0];
  const medications = latestVersion?.medications ?? [];

  const cacheKey = `${prescriptionId}:${latestVersion?.versionNumber ?? 0}:${record.updatedAt.getTime()}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;

  if (medications.length < 2) {
    const report: ContraindicationReport = {
      prescriptionId,
      hasInteractions: false,
      alerts: [],
      summary: "Fewer than 2 medications present; no multi-drug interactions detected.",
      disclaimer: DISCLAIMER,
      analyzedAt: new Date().toISOString(),
    };
    reportCache.set(cacheKey, report);
    return report;
  }

  // Get known patient conditions from health history
  const historyEntries = await db.healthHistoryEntry.findMany({
    where: { patientId: record.patientId },
    select: { title: true, notes: true },
    take: 10,
  });
  const patientConditions = historyEntries.map((h) => `${h.title}: ${h.notes ?? ""}`);

  let alerts: ContraindicationAlert[] = [];
  let summary = "";

  if (env.EXTRACTION_PROVIDER === "gemini" && env.GEMINI_API_KEY) {
    const aiResult = await analyzeWithGemini(env.GEMINI_API_KEY, medications, patientConditions);
    if (aiResult && aiResult.alerts.length > 0) {
      alerts = aiResult.alerts;
      summary = aiResult.summary;
    }
  }

  // If AI did not return or offline/fallback, use rule-based detection
  if (alerts.length === 0) {
    alerts = detectRuleBasedInteractions(medications);
    summary =
      alerts.length > 0
        ? `Identified ${alerts.length} potential interaction(s) requiring attention or routine monitoring.`
        : "No significant contraindications or drug-drug interactions detected among prescribed medications.";
  }

  const report: ContraindicationReport = {
    prescriptionId,
    hasInteractions: alerts.length > 0,
    alerts,
    summary,
    disclaimer: DISCLAIMER,
    analyzedAt: new Date().toISOString(),
  };

  reportCache.set(cacheKey, report);
  return report;
}
