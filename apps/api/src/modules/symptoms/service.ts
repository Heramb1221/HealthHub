import type { Env } from "../../config/env.js";
import { log } from "../../lib/logger.js";

export type TriageUrgency = "emergency" | "urgent" | "routine" | "self_care";

export interface QuestionOption {
  id: string;
  label: string;
  isRedFlag?: boolean;
  indicatesSeverity?: "mild" | "moderate" | "severe";
  associatedCondition?: string;
}

export interface RuleQuestion {
  id: string;
  category: "duration" | "characteristics" | "red_flags" | "associated_symptoms" | "history";
  question: string;
  subtext?: string;
  options: QuestionOption[];
}

export interface SymptomAnswer {
  questionId: string;
  questionText: string;
  selectedOptionId: string;
  selectedOptionLabel: string;
}

export interface MatchedRuleDetail {
  ruleName: string;
  condition: string;
  reason: string;
}

export interface SymptomAssessmentInput {
  symptoms: string[];
  description?: string;
  durationDays?: number;
  severity?: "mild" | "moderate" | "severe";
  patientAge?: number;
  answers?: SymptomAnswer[];
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
  matchedRules?: MatchedRuleDetail[];
  answeredQuestions?: SymptomAnswer[];
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

/** Generate dynamic rule-based screening questions tailored to the reported symptoms */
export function getRuleBasedQuestions(symptoms: string[]): RuleQuestion[] {
  const sLower = (symptoms || []).map((s) => s.toLowerCase()).join(" ");
  const isFever = sLower.includes("fever") || sLower.includes("temperature") || sLower.includes("chill");
  const isResp =
    sLower.includes("cough") ||
    sLower.includes("chest") ||
    sLower.includes("breath") ||
    sLower.includes("throat") ||
    sLower.includes("cold") ||
    sLower.includes("sneeze") ||
    sLower.includes("phlegm");
  const isGI =
    sLower.includes("stomach") ||
    sLower.includes("abdomin") ||
    sLower.includes("nausea") ||
    sLower.includes("vomit") ||
    sLower.includes("diarrhea") ||
    sLower.includes("loose") ||
    sLower.includes("acidity") ||
    sLower.includes("cramp");
  const isNeuro =
    sLower.includes("headache") ||
    sLower.includes("migraine") ||
    sLower.includes("dizz") ||
    sLower.includes("faint") ||
    sLower.includes("vision") ||
    sLower.includes("vertigo");
  const isJoint =
    sLower.includes("joint") ||
    sLower.includes("knee") ||
    sLower.includes("back") ||
    sLower.includes("muscle") ||
    sLower.includes("body ache") ||
    sLower.includes("stiff") ||
    sLower.includes("swelling");
  const isSkin =
    sLower.includes("rash") ||
    sLower.includes("itch") ||
    sLower.includes("hive") ||
    sLower.includes("skin") ||
    sLower.includes("spot") ||
    sLower.includes("blister") ||
    sLower.includes("allergy");

  const questions: RuleQuestion[] = [];

  // Question 1: Duration & Timing (Clinical timeline rule)
  questions.push({
    id: "q_duration",
    category: "duration",
    question: "How long have you been experiencing these symptoms?",
    subtext: "Clinical duration helps separate acute self-limiting episodes from subacute or progressive infections.",
    options: [
      { id: "dur_acute", label: "Less than 24 hours (acute onset)", indicatesSeverity: "mild" },
      { id: "dur_short", label: "1 to 3 days (developing)", indicatesSeverity: "moderate" },
      { id: "dur_medium", label: "4 to 7 days (persisting for nearly a week)", indicatesSeverity: "moderate" },
      { id: "dur_chronic", label: "More than 1 week (persistent or recurring)", indicatesSeverity: "severe" },
    ],
  });

  // Question 2: Severity & Trajectory
  questions.push({
    id: "q_progression",
    category: "characteristics",
    question: "How is the overall discomfort progressing?",
    subtext: "Understanding the clinical trajectory aids in determining urgency level.",
    options: [
      { id: "prog_mild", label: "Mild and manageable, daily routine uninterrupted", indicatesSeverity: "mild" },
      { id: "prog_stable", label: "Moderate discomfort, noticeable but stable", indicatesSeverity: "moderate" },
      { id: "prog_worsening", label: "Rapidly worsening or spreading today", indicatesSeverity: "severe" },
      { id: "prog_intermittent", label: "Comes and goes in waves or spasms", indicatesSeverity: "moderate" },
    ],
  });

  // Question 3: Chief Complaint Characteristics
  if (isResp) {
    questions.push({
      id: "q_resp_char",
      category: "characteristics",
      question: "Which best describes your respiratory or chest symptoms?",
      subtext: "Differentiating upper airway inflammation from bronchial involvement and cardiac sensation.",
      options: [
        {
          id: "resp_dry",
          label: "Dry, tickling cough with scratchy or sore throat",
          associatedCondition: "Upper Respiratory Tract Infection / Pharyngitis",
        },
        {
          id: "resp_productive",
          label: "Loose wet cough with yellow, green, or thick phlegm",
          associatedCondition: "Acute Bronchitis / Lower Respiratory Infection",
        },
        {
          id: "resp_chest_heavy",
          label: "Heavy crushing pressure or squeezing tightness radiating to jaw or left arm",
          isRedFlag: true,
          associatedCondition: "Acute Coronary Event",
        },
        {
          id: "resp_pleuritic",
          label: "Sharp stabbing chest discomfort worse when inhaling deeply or coughing",
          associatedCondition: "Pleuritis / Musculoskeletal Chest Wall Strain",
        },
        {
          id: "resp_reflux",
          label: "Burning sensation rising behind the breastbone, worse after eating or lying down",
          associatedCondition: "Gastroesophageal Reflux (GERD)",
        },
        { id: "resp_none", label: "No significant chest discomfort or productive phlegm" },
      ],
    });
  }

  if (isFever) {
    questions.push({
      id: "q_fever_char",
      category: "characteristics",
      question: "What is the pattern and intensity of your fever?",
      subtext: "Different pathogens present with distinct temperature patterns in Indian clinical practice.",
      options: [
        { id: "fever_low", label: "Low-grade fever (under 100.4°F / 38°C) with mild fatigue" },
        {
          id: "fever_high_chills",
          label: "High spiking fever (102°F+) with shivering, chills, or rigors",
          associatedCondition: "Acute Febrile Illness (Suspected Malaria / Dengue / Typhoid)",
        },
        {
          id: "fever_body_ache",
          label: "Moderate continuous fever with severe body ache, joint pain, or retro-orbital eye pain",
          associatedCondition: "Viral Syndrome / Dengue Screening",
        },
        {
          id: "fever_intermittent",
          label: "Fever that climbs higher in late afternoons or evenings with coated tongue",
          associatedCondition: "Enteric / Typhoid Fever Screening",
        },
      ],
    });
  }

  if (isGI) {
    questions.push({
      id: "q_gi_char",
      category: "characteristics",
      question: "Where is the abdominal discomfort located and how does it feel?",
      subtext: "Abdominal mapping provides high diagnostic specificity.",
      options: [
        {
          id: "gi_upper_burning",
          label: "Upper middle abdomen: burning acidity, fullness, or nausea after food",
          associatedCondition: "Dyspepsia / Acid Peptic Disease / GERD",
        },
        {
          id: "gi_cramping_diarrhea",
          label: "Generalized cramping with frequent watery loose bowel motions",
          associatedCondition: "Acute Gastroenteritis / Food-Borne Infection",
        },
        {
          id: "gi_lower_right",
          label: "Lower right abdomen: sharp localized pain that hurts to touch or walk",
          isRedFlag: true,
          associatedCondition: "Suspected Acute Appendicitis",
        },
        {
          id: "gi_bloating_constipation",
          label: "Lower abdominal bloating with difficulty passing stool or gas for 2+ days",
          associatedCondition: "Constipation / Colonic Dysmotility",
        },
        { id: "gi_mild", label: "Mild generalized discomfort without nausea or vomiting" },
      ],
    });
  }

  if (isNeuro) {
    questions.push({
      id: "q_neuro_char",
      category: "characteristics",
      question: "How did the headache begin and what are its features?",
      subtext: "Differentiating primary headaches from acute secondary neurovascular events.",
      options: [
        {
          id: "neuro_thunderclap",
          label: "Sudden explosive pain reaching peak within seconds ('worst headache ever')",
          isRedFlag: true,
          associatedCondition: "Thunderclap Headache / Acute Intracranial Event",
        },
        {
          id: "neuro_pulsating",
          label: "Throbbing or pulsating pain on one side of head with light/sound sensitivity",
          associatedCondition: "Migraine with / without Aura",
        },
        {
          id: "neuro_band",
          label: "Dull, constant band-like squeezing pressure across forehead or temples",
          associatedCondition: "Tension-Type Headache",
        },
        {
          id: "neuro_sinus",
          label: "Facial fullness and aching around cheekbones and eyes, worse bending forward",
          associatedCondition: "Acute Sinusitis",
        },
      ],
    });
  }

  if (isJoint) {
    questions.push({
      id: "q_joint_char",
      category: "characteristics",
      question: "What is the pattern of your joint or muscular discomfort?",
      subtext: "Distinguishing inflammatory rheumatologic involvement from mechanical wear.",
      options: [
        {
          id: "joint_stiff_morning",
          label: "Joint stiffness in the morning lasting over 30 to 45 minutes",
          associatedCondition: "Inflammatory Arthritis / Rheumatologic Evaluation",
        },
        {
          id: "joint_exertion",
          label: "Aching worse after physical activity, walking, or prolonged standing",
          associatedCondition: "Osteoarthritis / Mechanical Joint Strain",
        },
        {
          id: "joint_hot_swollen",
          label: "Joint is visibly swollen, red, hot to touch, and painful to bear any weight",
          isRedFlag: true,
          associatedCondition: "Acute Gout / Septic Arthritis Screen",
        },
        {
          id: "joint_muscle_ache",
          label: "Generalized muscular fatigue and aching across body without swollen joints",
          associatedCondition: "Myalgia / Post-Viral Fatigue",
        },
      ],
    });
  }

  if (isSkin) {
    questions.push({
      id: "q_skin_char",
      category: "characteristics",
      question: "What does the skin irritation or rash look like?",
      subtext: "Morphological screening for dermatologic and allergic manifestations.",
      options: [
        {
          id: "skin_hives",
          label: "Raised red itchy welts (hives / urticaria) that change position or flare up",
          associatedCondition: "Acute Urticaria / Allergic Reaction",
        },
        {
          id: "skin_dry_patches",
          label: "Dry, scaly, cracked red patches that itch intensely",
          associatedCondition: "Eczema / Contact Dermatitis",
        },
        {
          id: "skin_blisters",
          label: "Clusters of painful tingling fluid-filled blisters in a line or patch",
          associatedCondition: "Herpes Zoster / Shingles Screen",
        },
        {
          id: "skin_petechiae",
          label: "Tiny pinpoint purple or red spots that do not turn pale when pressed",
          isRedFlag: true,
          associatedCondition: "Petechial Rash / Platelet Screener",
        },
      ],
    });
  }

  // Question 4: Targeted Clinical Red Flags Screener (Always included)
  questions.push({
    id: "q_red_flags",
    category: "red_flags",
    question: "Are you experiencing any of these critical emergency warning signs?",
    subtext: "Clinical safety screener: please answer accurately.",
    options: [
      { id: "rf_breathing", label: "Severe shortness of breath, gasping, or bluish lips/fingertips", isRedFlag: true },
      { id: "rf_neuro", label: "Sudden facial drooping, arm weakness, or slurred speech", isRedFlag: true },
      { id: "rf_bleeding", label: "Vomiting blood, coughing up blood, or black tarry stools", isRedFlag: true },
      { id: "rf_neck_confusion", label: "Inability to touch chin to chest (stiff neck) with high fever or confusion", isRedFlag: true },
      { id: "rf_fainting", label: "Loss of consciousness, fainting, or severe persistent dizziness on standing", isRedFlag: true },
      { id: "rf_none", label: "None of these warning signs are present" },
    ],
  });

  // Question 5: Health Background & Comorbidities (Always included)
  questions.push({
    id: "q_context",
    category: "history",
    question: "Do you have any existing chronic conditions or recent risk factors?",
    subtext: "Personal context tailors the clinical advice and follow-up timeline.",
    options: [
      { id: "ctx_diabetes_htn", label: "Diabetes, Hypertension, or Heart Disease" },
      { id: "ctx_asthma", label: "Asthma, COPD, or chronic respiratory allergies" },
      { id: "ctx_recent_travel", label: "Recent travel, outdoor mosquito exposure, or sick contacts at home" },
      { id: "ctx_rx_meds", label: "Currently taking prescription medications (e.g. blood thinners, immunosuppressants)" },
      { id: "ctx_healthy", label: "No significant underlying chronic conditions" },
    ],
  });

  return questions;
}

/** Rule-based clinical triage and differential diagnosis inference engine */
export function evaluateRuleBasedTriage(input: SymptomAssessmentInput): SymptomAssessmentResult {
  const combinedText = [...(input.symptoms || []), input.description || ""].join(" ").toLowerCase();

  const answers = input.answers || [];
  const selectedOptionIds = new Set(answers.map((a) => a.selectedOptionId));

  const detectedRedFlags: string[] = [];
  let urgentAction = "";
  const matchedRules: MatchedRuleDetail[] = [];

  // 1. Check keyword-based red flags
  for (const rule of RED_FLAG_RULES) {
    if (rule.keywords.some((k) => combinedText.includes(k))) {
      detectedRedFlags.push(rule.flag);
      if (!urgentAction) urgentAction = rule.action;
      matchedRules.push({
        ruleName: "Emergency Keyword Screener",
        condition: "Acute Emergency Evaluation",
        reason: rule.flag,
      });
    }
  }

  // 2. Check question-based red flags
  if (selectedOptionIds.has("resp_chest_heavy")) {
    detectedRedFlags.push("Potential Acute Coronary / Cardiac Event: Squeezing chest pressure radiating to arm or jaw.");
    urgentAction = "Call emergency services (112) or go to the nearest emergency department immediately.";
    matchedRules.push({
      ruleName: "Acute Coronary Syndrome Rule",
      condition: "Suspected Acute Coronary Event",
      reason: "Patient reported squeezing chest tightness radiating to jaw or left arm.",
    });
  }

  if (selectedOptionIds.has("gi_lower_right")) {
    detectedRedFlags.push("Focal Right Lower Quadrant Tenderness: Elevated risk of acute appendicitis.");
    if (!urgentAction) urgentAction = "Seek in-person medical evaluation at a hospital emergency clinic within 2–4 hours.";
    matchedRules.push({
      ruleName: "Acute Appendicitis Screening Rule",
      condition: "Suspected Acute Appendicitis",
      reason: "Localized lower right abdominal tenderness requiring surgical evaluation.",
    });
  }

  if (selectedOptionIds.has("neuro_thunderclap")) {
    detectedRedFlags.push("Thunderclap Headache: Sudden peak explosive headache requires acute vascular imaging.");
    urgentAction = "Immediate emergency department evaluation required for brain CT / neurological evaluation.";
    matchedRules.push({
      ruleName: "Thunderclap Headache Rule",
      condition: "Acute Neurovascular Emergency",
      reason: "Explosive peak headache within 60 seconds.",
    });
  }

  if (selectedOptionIds.has("joint_hot_swollen")) {
    detectedRedFlags.push("Acute Monoarthritis: Severely swollen, hot, excruciating joint requires urgent joint fluid analysis.");
    if (!urgentAction) urgentAction = "Consult an orthopedic surgeon or emergency room today.";
    matchedRules.push({
      ruleName: "Septic / Crystal Arthritis Rule",
      condition: "Acute Inflammatory Monoarthritis (Gout / Septic Arthritis)",
      reason: "Erythematous, hot, swollen joint with severe weight-bearing restriction.",
    });
  }

  if (selectedOptionIds.has("skin_petechiae")) {
    detectedRedFlags.push("Non-blanching Petechial Spots: Platelet or capillary integrity concern.");
    if (!urgentAction) urgentAction = "Visit an emergency room or hospital for urgent complete blood count (CBC).";
    matchedRules.push({
      ruleName: "Petechial Purpura Rule",
      condition: "Thrombocytopenia / Vasculitis Screening",
      reason: "Non-blanching pinpoint spots reported.",
    });
  }

  if (selectedOptionIds.has("rf_breathing")) {
    detectedRedFlags.push("Critical Respiratory Distress: Severe shortness of breath or cyanosis.");
    urgentAction = "Seek immediate emergency medical attention or call 112.";
  }
  if (selectedOptionIds.has("rf_neuro")) {
    detectedRedFlags.push("Acute Stroke / Neurological Sign: Sudden weakness, facial droop, or speech impairment.");
    urgentAction = "Call emergency services immediately (112). Time is brain.";
  }
  if (selectedOptionIds.has("rf_bleeding")) {
    detectedRedFlags.push("Gastrointestinal / Respiratory Hemorrhage: Active blood vomiting or melena.");
    urgentAction = "Proceed directly to a hospital emergency room.";
  }
  if (selectedOptionIds.has("rf_neck_confusion")) {
    detectedRedFlags.push("Meningeal Irritation / Encephalopathy: Neck stiffness with high fever or altered mental state.");
    urgentAction = "Emergency room evaluation required immediately.";
  }
  if (selectedOptionIds.has("rf_fainting")) {
    detectedRedFlags.push("Syncope / Severe Hemodynamic Instability.");
    if (!urgentAction) urgentAction = "Visit emergency department for cardiac and blood pressure evaluation.";
  }

  // If any red flags or self-reported severe emergency
  if (detectedRedFlags.length > 0 || input.severity === "severe") {
    return {
      urgency: "emergency",
      urgencyLabel: "Emergency Attention Recommended",
      redFlags: detectedRedFlags.length > 0 ? detectedRedFlags : ["Severe acute symptom severity reported."],
      possibleExplanations: [
        {
          condition: "Acute Clinical Assessment Required",
          likelihood: "high",
          description: "Symptoms require urgent in-person physical examination by emergency clinicians to rule out acute life-threatening conditions.",
        },
      ],
      matchedRules: matchedRules.length > 0 ? matchedRules : [
        {
          ruleName: "Severity Threshold Rule",
          condition: "Acute Emergency Triage",
          reason: "Severe symptom intensity or acute physiological distress.",
        },
      ],
      answeredQuestions: answers,
      recommendedAction: urgentAction || "Seek immediate medical attention at an emergency clinic or hospital.",
      followUpQuestions: [
        "Do you have a personal history of cardiac, respiratory, or neurological conditions?",
        "Are you currently on any blood thinner or prescription medication?",
      ],
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
      analyzedAt: new Date().toISOString(),
      provider: "clinical_rules",
    };
  }

  // 3. Clinical Rule Inference for Non-Emergency Differentials
  const isFever = combinedText.includes("fever") || combinedText.includes("temperature") || selectedOptionIds.has("fever_low") || selectedOptionIds.has("fever_high_chills") || selectedOptionIds.has("fever_body_ache") || selectedOptionIds.has("fever_intermittent");
  const isCough = combinedText.includes("cough") || combinedText.includes("throat") || combinedText.includes("cold") || selectedOptionIds.has("resp_dry") || selectedOptionIds.has("resp_productive");
  const isAbdominal = combinedText.includes("stomach") || combinedText.includes("abdominal") || combinedText.includes("vomiting") || combinedText.includes("diarrhea") || selectedOptionIds.has("gi_upper_burning") || selectedOptionIds.has("gi_cramping_diarrhea") || selectedOptionIds.has("gi_bloating_constipation");
  const isHeadache = combinedText.includes("headache") || combinedText.includes("migraine") || selectedOptionIds.has("neuro_pulsating") || selectedOptionIds.has("neuro_band") || selectedOptionIds.has("neuro_sinus");
  const isJointPain = combinedText.includes("joint") || combinedText.includes("knee") || combinedText.includes("back") || selectedOptionIds.has("joint_stiff_morning") || selectedOptionIds.has("joint_exertion") || selectedOptionIds.has("joint_muscle_ache");
  const isSkinRash = combinedText.includes("rash") || combinedText.includes("itch") || selectedOptionIds.has("skin_hives") || selectedOptionIds.has("skin_dry_patches") || selectedOptionIds.has("skin_blisters");

  const explanations: PossibleExplanation[] = [];
  let urgency: TriageUrgency = "routine";
  let urgencyLabel = "Routine Medical Consultation";
  let recommendedAction = "Schedule an appointment with a general physician for formal clinical evaluation.";

  // Rule: Respiratory conditions
  if (selectedOptionIds.has("resp_productive")) {
    explanations.push({
      condition: "Acute Bronchitis / Lower Respiratory Tract Infection",
      likelihood: "high",
      description: "Inflammation of the bronchial airways with mucus hypersecretion. Usually viral, occasionally bacterial.",
    });
    matchedRules.push({
      ruleName: "Productive Cough Rule",
      condition: "Acute Bronchitis",
      reason: "Productive phlegm cough reported in questionnaire.",
    });
    if ((input.durationDays ?? 0) > 3 || selectedOptionIds.has("dur_medium") || selectedOptionIds.has("dur_chronic")) {
      urgency = "urgent";
      urgencyLabel = "Urgent Outpatient Review";
      recommendedAction = "Consult a physician or pulmonologist within 24 hours for chest auscultation and oxygen saturation check.";
    }
  } else if (selectedOptionIds.has("resp_dry") || (isFever && isCough)) {
    explanations.push({
      condition: "Upper Respiratory Tract Infection / Seasonal Viral Flu",
      likelihood: "high",
      description: "Common seasonal viral infection of the nasal and pharyngeal mucosa.",
    });
    explanations.push({
      condition: "Viral Pharyngitis",
      likelihood: "moderate",
      description: "Throat inflammation frequently accompanying seasonal colds.",
    });
    matchedRules.push({
      ruleName: "Upper Respiratory Syndrome Rule",
      condition: "Viral URTI / Flu",
      reason: "Dry cough, sore throat, and mild-to-moderate febrile illness.",
    });
  }

  // Rule: Reflux / GERD
  if (selectedOptionIds.has("resp_reflux") || selectedOptionIds.has("gi_upper_burning")) {
    explanations.push({
      condition: "Gastroesophageal Reflux Disease (GERD) / Dyspepsia",
      likelihood: "high",
      description: "Acid irritation of the esophagus and stomach lining, commonly aggravated after meals or reclining.",
    });
    matchedRules.push({
      ruleName: "Acid Peptic Disease Rule",
      condition: "GERD / Dyspepsia",
      reason: "Upper retrosternal or epigastric burning discomfort.",
    });
    recommendedAction = "Avoid lying down immediately after meals and avoid spicy/fried foods. Consult a doctor if antacids provide no relief.";
  }

  // Rule: High fever with chills (Endemic febrile illness in India)
  if (selectedOptionIds.has("fever_high_chills") || selectedOptionIds.has("fever_body_ache")) {
    explanations.push({
      condition: "Acute Febrile Illness (Suspected Dengue / Malaria / Viral Syndrome)",
      likelihood: "moderate",
      description: "High fever with chills and prominent myalgias. Common in monsoon and endemic regions; warrants blood testing.",
    });
    matchedRules.push({
      ruleName: "Febrile Illness Screening Rule",
      condition: "Acute Febrile Illness",
      reason: "High spiking temperature accompanied by chills, rigors, or generalized body aches.",
    });
    urgency = "urgent";
    urgencyLabel = "Urgent Outpatient Review";
    recommendedAction = "Consult a physician within 24 hours for Complete Blood Count (CBC), platelet count, and rapid malaria/dengue screening.";
  }

  // Rule: Gastroenteritis
  if (selectedOptionIds.has("gi_cramping_diarrhea") || (isAbdominal && (combinedText.includes("diarrhea") || combinedText.includes("vomit")))) {
    explanations.push({
      condition: "Acute Gastroenteritis / Infectious Enteritis",
      likelihood: "high",
      description: "Irritation and inflammation of the stomach and intestines, usually food-borne or viral.",
    });
    matchedRules.push({
      ruleName: "Gastroenteritis Rule",
      condition: "Acute Gastroenteritis",
      reason: "Abdominal cramping coupled with frequent loose watery stools.",
    });
    recommendedAction = "Prevent dehydration by taking Oral Rehydration Solution (ORS), coconut water, or clear fluids. Consult a doctor if vomiting prevents fluid intake.";
  }

  // Rule: Headache classifications
  if (selectedOptionIds.has("neuro_pulsating") || (isHeadache && combinedText.includes("migraine"))) {
    explanations.push({
      condition: "Migraine with / without Aura",
      likelihood: "high",
      description: "Neurovascular headache syndrome characterized by pulsating unilateral pain, photophobia, and nausea.",
    });
    matchedRules.push({
      ruleName: "Vascular Headache Rule",
      condition: "Migraine",
      reason: "Pulsating/throbbing headache with sensory hypersensitivity.",
    });
    recommendedAction = "Rest in a quiet, dark room. Apply cool compress and maintain hydration. Consult a physician or neurologist if episodes recur.";
  } else if (selectedOptionIds.has("neuro_band") || (isHeadache && !isFever)) {
    explanations.push({
      condition: "Tension-Type Headache",
      likelihood: "high",
      description: "Diffuse, non-pulsatile band-like headache frequently linked to muscle tightness, stress, or eye strain.",
    });
    matchedRules.push({
      ruleName: "Tension Headache Rule",
      condition: "Tension-Type Headache",
      reason: "Band-like constant pressure across temples or forehead without focal neurological signs.",
    });
  } else if (selectedOptionIds.has("neuro_sinus")) {
    explanations.push({
      condition: "Acute Sinusitis",
      likelihood: "high",
      description: "Inflammation of the paranasal sinus cavities causing facial pressure around eyes and cheeks.",
    });
    matchedRules.push({
      ruleName: "Sinonasal Pressure Rule",
      condition: "Acute Sinusitis",
      reason: "Facial pain worse upon bending forward.",
    });
  }

  // Rule: Musculoskeletal / Joint
  if (selectedOptionIds.has("joint_stiff_morning")) {
    explanations.push({
      condition: "Inflammatory Arthritis / Rheumatologic Evaluation Needed",
      likelihood: "moderate",
      description: "Morning stiffness lasting more than 30 minutes suggests an inflammatory or autoimmune joint condition.",
    });
    matchedRules.push({
      ruleName: "Morning Stiffness Rule",
      condition: "Inflammatory Arthritis",
      reason: "Morning gel phenomenon > 30 minutes reported.",
    });
    urgency = "routine";
    recommendedAction = "Consult a rheumatologist or orthopedic specialist for inflammatory marker tests (ESR, CRP, uric acid).";
  } else if (selectedOptionIds.has("joint_exertion") || isJointPain) {
    explanations.push({
      condition: "Musculoskeletal Strain / Osteoarthritis",
      likelihood: "moderate",
      description: "Mechanical joint strain or cartilage wear worsened by weight-bearing and physical exertion.",
    });
    matchedRules.push({
      ruleName: "Mechanical Joint Strain Rule",
      condition: "Osteoarthritis / Musculoskeletal Strain",
      reason: "Discomfort exacerbated by movement or exertion.",
    });
  }

  // Rule: Dermatologic
  if (selectedOptionIds.has("skin_hives") || isSkinRash) {
    explanations.push({
      condition: "Acute Urticaria / Allergic Skin Reaction",
      likelihood: "high",
      description: "Transient erythematous itchy wheals triggered by food, allergen contact, or post-viral reaction.",
    });
    matchedRules.push({
      ruleName: "Urticarial Wheal Rule",
      condition: "Acute Urticaria",
      reason: "Raised itchy welts appearing and disappearing rapidly.",
    });
    recommendedAction = "Avoid rubbing or scratching. Use cool compresses. Consult a dermatologist or physician if hives spread or persist.";
  }

  // Fallback non-specific
  if (explanations.length === 0) {
    explanations.push({
      condition: "Non-specific Symptom Cluster",
      likelihood: "possible",
      description: "Reported symptoms require a comprehensive clinical history and physical examination by a physician.",
    });
    matchedRules.push({
      ruleName: "General Symptom Evaluation Rule",
      condition: "Outpatient Assessment",
      reason: "No single high-probability organ-system syndrome criteria met.",
    });
  }

  // Self-care heuristic
  if (
    urgency === "routine" &&
    (selectedOptionIds.has("dur_acute") || (input.durationDays ?? 0) <= 1) &&
    (selectedOptionIds.has("prog_mild") || input.severity === "mild") &&
    !isFever &&
    explanations.length > 0 &&
    (explanations[0]?.condition.includes("Tension") || explanations[0]?.condition.includes("Strain"))
  ) {
    urgency = "self_care";
    urgencyLabel = "Self-Care & Observation";
    recommendedAction = "Rest and monitor symptoms at home for 24–48 hours. Consult a doctor if pain persists or intensifies.";
  }

  return {
    urgency,
    urgencyLabel,
    redFlags: [],
    possibleExplanations: explanations,
    matchedRules,
    answeredQuestions: answers,
    recommendedAction,
    followUpQuestions: [
      "Have you noticed any specific triggers that make the symptoms better or worse?",
      "Are you currently taking any regular prescription medications for this or other health conditions?",
    ],
    clinicalDisclaimer: CLINICAL_DISCLAIMER,
    analyzedAt: new Date().toISOString(),
    provider: "clinical_rules",
  };
}

/** Triage powered by Gemini with clinical rule fallback and rule-based questionnaire integration */
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
    const answersText = (input.answers || [])
      .map((a) => `- ${a.questionText}: ${a.selectedOptionLabel}`)
      .join("\n");

    const prompt = `You are a clinical decision-support triage assistant for HealthHub India.
Analyze the following patient-reported symptoms and structured rule-based questionnaire answers for triage purposes ONLY.
STRICT CLINICAL RULES:
1. You must NEVER give a definitive diagnosis.
2. You must NEVER prescribe medicines, antibiotics, or recommend specific drug dosages.
3. Categorize urgency as one of: "emergency", "urgent", "routine", "self_care". Never downgrade an existing urgency from the rule engine.
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
Age: ${input.patientAge ? `${input.patientAge} years` : "Adult"}

Patient Responses to Clinical Questionnaire:
${answersText || "None provided"}

Rule Engine Baseline Differentials:
${fallback.possibleExplanations.map((e) => `- ${e.condition} (${e.likelihood})`).join("\n")}`;

    const modelName = env.GEMINI_MODEL || "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
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
      matchedRules: fallback.matchedRules,
      answeredQuestions: input.answers,
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
