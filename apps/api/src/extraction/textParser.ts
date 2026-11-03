/**
 * Rule-based parser: OCR text of a printed prescription -> the raw extraction shape that
 * `normalizeExtraction` (the safety gate) consumes.
 *
 * Principles (healthcare software, so conservative on purpose):
 *  - Transcribe, never infer. Notation like "1-0-1" is kept exactly as written; a dose is only filled
 *    when the document states one ("5 ml", "1 tablet"). A missing field stays null so the patient is
 *    asked to fill it in, rather than silently receiving a guess.
 *  - Never fabricate a prescriber. A name is only returned when it follows "Dr." (or sits next to
 *    medical qualifications) and it is not the patient, a clinic, a hospital or a pharmacy.
 *  - Confidence is capped below the review threshold (0.85): OCR can misread digits, so nothing this
 *    parser produces is ever treated as confirmed without the patient checking it.
 */

export interface OcrLine {
  text: string;
  /** Mean word confidence for the line, 0-100, when the OCR engine reports it. */
  confidence?: number;
}

export interface ParsedPrescription {
  prescriptionDate: string | null;
  prescriberName: string | null;
  overallConfidence: number;
  medications: ParsedMedication[];
}

export interface ParsedMedication {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  confidence: number;
}

/** Local OCR output is never "confident" enough to skip patient review. */
export const LOCAL_CONFIDENCE_CAP = 0.8;

const FORMS = [
  "tablet", "tablets", "tabs", "tab", "capsule", "capsules", "caps", "cap", "syrup", "syp", "suspension", "susp",
  "injection", "inj", "ointment", "oint", "cream", "gel", "lotion", "drops", "drop", "powder", "sachet", "inhaler",
  "spray", "solution", "soln", "respules", "rotacap", "lozenges", "patch", "suppository", "supp",
];
const FORM_RE = new RegExp(`^(?:${FORMS.join("|")})\\b\\.?`, "i");

const STRENGTH_RE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ug|g|iu|%)(?:\s?\/\s?\d+(?:\.\d+)?\s?(?:ml|g))?(?![A-Za-z])/i;
const DOSE_RE =
  /\b(?:\d+(?:\.\d+)?|half|one|two|three|1\/2|1\/4)\s?(?:ml|tab(?:let)?s?|cap(?:sule)?s?|drops?|puffs?|tsp|tbsp|spoons?|units?|sachets?)\b/i;
const FREQ_PATTERN_RE = /(?<![\d.])[0-4]\s?[-–]\s?[0-4]\s?[-–]\s?[0-4](?:\s?[-–]\s?[0-4])?(?![\d.])/;
const FREQ_WORD_RE =
  /\b(?:once\s+(?:a\s+)?(?:day|daily)|twice\s+(?:a\s+)?(?:day|daily)|thrice\s+(?:a\s+)?(?:day|daily)|(?:two|three|four)\s+times\s+(?:a\s+)?(?:day|daily)|every\s+\d+\s?(?:hours?|hrs?|h)|q\d+h|OD|BD|BID|TDS|TID|QID|QDS|HS|SOS|PRN|STAT|daily|at\s+night|at\s+bedtime|nightly|in\s+the\s+morning)\b/i;
const DURATION_RE = /(?:(?:\bx|×|\bfor)\s*)?(?<![\d.])(\d+)\s?(days?|d|weeks?|wks?|months?|mo)\b/i;
const INSTRUCTION_RE =
  /\b(?:(?:after|before|with|without)\s+(?:food|meals?|breakfast|lunch|dinner|milk|water)|on\s+(?:an\s+)?empty\s+stomach|at\s+bedtime|at\s+night|if\s+needed|as\s+needed|when\s+required|SOS|PRN|apply\s+(?:locally|externally|twice\s+daily)|shake\s+well|gargle)\b/gi;

const CLINIC_WORDS =
  /\b(clinic|hospital|centre|center|diagnostic[s]?|pharmacy|chemist|medical\s+store|medicals?|labs?|laborator(?:y|ies)|nursing\s+home|polyclinic|healthcare|health\s+care|institute|trust|dispensary|care)\b/i;
const QUALIFICATION_RE =
  /\b(MBBS|M\.?D\.?|M\.?S\.?|D\.?N\.?B\.?|BAMS|BHMS|BDS|MDS|DGO|DCH|DM|MCh|MRCP|FRCS|FCPS|DNB|MBBS,?)\b/;
const PATIENT_LABEL_RE = /\b(?:patient(?:'s)?(?:\s+name)?|pt\.?(?:\s+name)?|name\s+of\s+patient|name)\s*[:-]/i;
const STOP_TOKENS = new Set([
  "date", "reg", "regd", "registration", "mob", "mobile", "ph", "phone", "tel", "age", "sex", "time", "email", "mbbs", "md", "ms",
  "dnb", "bams", "bhms", "bds", "no", "opd", "id", "uhid", "address", "clinic", "hospital", "consultant", "physician", "surgeon",
]);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function normaliseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Find a date in one line. Numeric dates are read day-first (Indian convention), as written. */
export function findDate(text: string): string | null {
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const yearRaw = m[3] as string;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    return validIso(year, Number(m[2]), Number(m[1]));
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})\b/.exec(text);
  if (m) {
    const month = MONTHS[(m[2] as string).slice(0, 4).toLowerCase()] ?? MONTHS[(m[2] as string).slice(0, 3).toLowerCase()];
    if (month) return validIso(Number(m[3]), month, Number(m[1]));
  }
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(text);
  if (m) {
    const month = MONTHS[(m[1] as string).slice(0, 4).toLowerCase()] ?? MONTHS[(m[1] as string).slice(0, 3).toLowerCase()];
    if (month) return validIso(Number(m[3]), month, Number(m[2]));
  }
  return null;
}

const NON_PRESCRIPTION_DATE_RE = /\b(dob|d\.o\.b|born|birth|valid\s+(?:till|until|upto)|expiry|exp\.?|review|follow[\s-]?up|next\s+visit|revisit|due)\b/i;

function pickDate(lines: OcrLine[]): string | null {
  for (const line of lines) {
    if (/\bdate\b/i.test(line.text) && !NON_PRESCRIPTION_DATE_RE.test(line.text)) {
      const found = findDate(line.text);
      if (found) return found;
    }
  }
  for (const line of lines.slice(0, 14)) {
    if (NON_PRESCRIPTION_DATE_RE.test(line.text)) continue;
    const found = findDate(line.text);
    if (found) return found;
  }
  return null;
}

function patientNames(lines: OcrLine[]): string[] {
  const names: string[] = [];
  for (const { text } of lines) {
    const m = PATIENT_LABEL_RE.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    const name = normaliseSpaces(rest.split(/\b(?:age|sex|date|gender|mob|ph|dob|uhid|id)\b/i)[0] ?? "").replace(/[^\p{L}.' -]/gu, "").trim();
    if (name.length >= 3) names.push(name.toLowerCase().replace(/^(mr|mrs|ms|master|baby|shri|smt)\.?\s+/i, ""));
  }
  return names;
}

function cleanDoctorName(raw: string): string | null {
  const tokens = raw.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const bare = token.replace(/[,;:()]+$/g, "");
    if (!bare) break;
    if (/\d/.test(bare)) break;
    if (STOP_TOKENS.has(bare.replace(/[.,]/g, "").toLowerCase())) break;
    if (!/^[\p{L}][\p{L}.'’-]*$/u.test(bare)) break;
    out.push(bare);
    if (/[,;:()]$/.test(token)) break;
    if (out.length >= 4) break;
  }
  if (out.length === 0) return null;
  const name = out.join(" ");
  if (name.replace(/[^\p{L}]/gu, "").length < 3) return null;
  return name;
}

/** Pull the prescribing doctor from "Dr. <name>" lines, never from patient, clinic or pharmacy lines. */
export function findPrescriber(lines: OcrLine[], patients: string[] = patientNames(lines)): string | null {
  const counts = new Map<string, { name: string; count: number; score: number; first: number }>();
  lines.forEach((line, index) => {
    const text = normaliseSpaces(line.text);
    for (const m of text.matchAll(/(?<![\p{L}])(?:Dr|Doctor)\.?\s*([\p{L}][^\n]*)/giu)) {
      const before = text.slice(0, m.index ?? 0);
      if (PATIENT_LABEL_RE.test(before)) continue;
      const candidate = cleanDoctorName(m[1] as string);
      if (!candidate) continue;
      const afterName = text.slice((m.index ?? 0) + m[0].length - (m[1] as string).length + candidate.length);
      // "Dr. Sharma Clinic" / "Dr. Mehta's Hospital" names an organisation, not a person we can be sure of.
      if (CLINIC_WORDS.test(candidate) || /^[’']?s?\s+(?:clinic|hospital|centre|center|diagnostic|pharmacy|care)/i.test(afterName)) continue;
      const key = candidate.toLowerCase().replace(/[.\s]+/g, " ").trim();
      if (patients.some((p) => p === key || p.includes(key) || key.includes(p))) continue;
      const next = lines[index + 1]?.text ?? "";
      const qualified = QUALIFICATION_RE.test(afterName) || QUALIFICATION_RE.test(next);
      const entry = counts.get(key) ?? { name: `Dr. ${candidate.replace(/^Dr\.?\s*/i, "")}`, count: 0, score: 0, first: index };
      entry.count += 1;
      entry.score += qualified ? 2 : 1;
      counts.set(key, entry);
    }
  });
  // OCR can spell the same name differently in the header and the signature ("Deshmukh"/"peshmukh").
  // Merge near-identical spellings, then prefer the spelling that is properly capitalised: a name
  // that actually appears in the document, never one we construct.
  const lowercaseInitials = (name: string) => name.split(/\s+/).filter((t) => /^\p{Ll}/u.test(t.replace(/^Dr\.?$/i, "D"))).length;
  const groups: { name: string; keys: string[]; count: number; score: number; first: number }[] = [];
  for (const [key, entry] of counts) {
    const group = groups.find((g) => g.keys.some((k) => editDistance(k, key) <= 2 && Math.abs(k.length - key.length) <= 2));
    if (group) {
      group.keys.push(key);
      group.count += entry.count;
      group.score += entry.score;
      group.first = Math.min(group.first, entry.first);
      if (lowercaseInitials(entry.name) < lowercaseInitials(group.name)) group.name = entry.name;
    } else {
      groups.push({ name: entry.name, keys: [key], count: entry.count, score: entry.score, first: entry.first });
    }
  }
  const ranked = groups.sort((a, b) => b.score - a.score || a.first - b.first);
  return ranked[0]?.name ?? null;
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j] as number;
      prev[j] = Math.min(above + 1, (prev[j - 1] as number) + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length] as number;
}

interface RowDraft {
  text: string;
  confidences: number[];
}

function startsMedicineLine(text: string): boolean {
  const stripped = text.replace(/^\s*(?:\d{1,2}\s*[).:-]\s*|[-•*·–]\s*)/, "");
  return FORM_RE.test(stripped);
}

function looksLikeContinuation(text: string): boolean {
  if (startsMedicineLine(text) || /^\s*\d{1,2}\s*[).:]\s*\S/.test(text)) return false;
  let rest = text;
  rest = rest.replace(STRENGTH_RE, " ").replace(DOSE_RE, " ").replace(FREQ_PATTERN_RE, " ").replace(FREQ_WORD_RE, " ");
  rest = rest.replace(DURATION_RE, " ").replace(INSTRUCTION_RE, " ").replace(/[^\p{L}\d]+/gu, " ");
  return normaliseSpaces(rest).length === 0 && /[\p{L}\d]/u.test(text);
}

function parseMedicineRow(draft: RowDraft): ParsedMedication | null {
  let text = normaliseSpaces(draft.text.replace(/^\s*(?:\d{1,2}\s*[).:-]\s*|[-•*·–]\s*)/, ""));
  const formMatch = FORM_RE.exec(text);
  if (formMatch) text = text.slice(formMatch[0].length).trim();

  const strengthMatch = STRENGTH_RE.exec(text);
  const freqPattern = FREQ_PATTERN_RE.exec(text);
  const freqWord = freqPattern ? null : FREQ_WORD_RE.exec(text);
  const doseMatch = DOSE_RE.exec(text);
  const durationMatch = DURATION_RE.exec(text);
  const instructionMatches = [...text.matchAll(INSTRUCTION_RE)].map((m) => normaliseSpaces(m[0]).toLowerCase());

  // The name is whatever comes before the first dosage/frequency/duration/instruction marker.
  const markers = [strengthMatch, freqPattern, freqWord, doseMatch, durationMatch]
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m.index);
  for (const m of text.matchAll(INSTRUCTION_RE)) markers.push(m.index ?? text.length);
  const cut = markers.length ? Math.min(...markers) : text.length;
  const name = normaliseSpaces(text.slice(0, cut).replace(/[\s,;:|.\-–]+$/g, "").replace(/^[\s,;:|.\-–]+/g, ""));
  if (name.length < 2 || !/\p{L}{2}/u.test(name)) return null;

  const strength = strengthMatch ? normaliseSpaces(strengthMatch[0]) : null;
  const dose = doseMatch ? normaliseSpaces(doseMatch[0]) : null;
  const frequency = freqPattern ? freqPattern[0].replace(/\s+/g, "").replace(/–/g, "-") : freqWord ? normaliseSpaces(freqWord[0]) : null;
  let duration: string | null = null;
  if (durationMatch) {
    const unit = (durationMatch[2] as string).toLowerCase();
    const normalisedUnit = unit.startsWith("d") ? "days" : unit.startsWith("w") ? "weeks" : "months";
    duration = `${durationMatch[1]} ${normalisedUnit}`;
  }
  const instructions = instructionMatches.length ? [...new Set(instructionMatches)].join("; ") : null;

  const found = [strength, frequency, duration].filter(Boolean).length;
  const ocr = draft.confidences.length ? Math.min(...draft.confidences) / 100 : 0.6;
  const confidence = Math.max(0.05, Math.min(LOCAL_CONFIDENCE_CAP, ocr, 0.5 + 0.1 * found));
  return { name, strength, dose, route: null, frequency, duration, instructions, confidence: Number(confidence.toFixed(2)) };
}

/**
 * Parse the OCR lines of a printed prescription.
 * `meanConfidence` is the OCR engine's overall confidence (0-100) when available.
 */
export function parsePrescriptionText(lines: OcrLine[], meanConfidence?: number): ParsedPrescription {
  const cleaned = lines.map((l) => ({ text: l.text.replace(/\u00a0/g, " ").trim(), confidence: l.confidence })).filter((l) => l.text.length > 0);
  const prescriptionDate = pickDate(cleaned);
  const prescriberName = findPrescriber(cleaned);

  const drafts: RowDraft[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const line = cleaned[i] as OcrLine;
    const medicineStart = startsMedicineLine(line.text);
    const strongContent = STRENGTH_RE.test(line.text) && (FREQ_PATTERN_RE.test(line.text) || FREQ_WORD_RE.test(line.text) || DURATION_RE.test(line.text));
    const numbered = /^\s*\d{1,2}\s*[).]\s*\S/.test(line.text);
    if (!(medicineStart || (strongContent && numbered))) continue;
    const draft: RowDraft = { text: line.text, confidences: line.confidence === undefined ? [] : [line.confidence] };
    while (i + 1 < cleaned.length && looksLikeContinuation((cleaned[i + 1] as OcrLine).text)) {
      i += 1;
      const next = cleaned[i] as OcrLine;
      draft.text += ` ${next.text}`;
      if (next.confidence !== undefined) draft.confidences.push(next.confidence);
    }
    drafts.push(draft);
  }

  const seen = new Set<string>();
  const medications: ParsedMedication[] = [];
  for (const draft of drafts) {
    const row = parseMedicineRow(draft);
    if (!row) continue;
    const key = `${row.name?.toLowerCase()}|${row.strength}|${row.frequency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    medications.push(row);
  }

  const ocrMean = meanConfidence === undefined ? 0.6 : meanConfidence / 100;
  const overallConfidence =
    medications.length === 0
      ? Math.min(0.15, ocrMean / 5)
      : Number(Math.max(0.05, Math.min(LOCAL_CONFIDENCE_CAP, ocrMean, ...medications.map((m) => m.confidence))).toFixed(2));
  return { prescriptionDate, prescriberName, overallConfidence, medications };
}
