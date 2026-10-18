import { ExtractionUnrecognizedError, type ExtractionInput, type ExtractionProvider } from "./types.js";

const DEFAULT_MODEL = "gemini-flash-latest";

const PROMPT = `You are a clinical document transcription assistant in a medical records platform.
Your task is to transcribe and extract prescription details and medication instructions from the provided document image or PDF.

Strict Medical & Clinical Safety Rules:
1. Do NOT invent, assume, or hallucinate any medications, dosages, or frequencies.
2. Only transcribe what is visibly written or printed in the document.
3. If any field (name, strength, dose, route, frequency, duration, instructions) is unclear, illegible, or absent, set it to null.
4. Set realistic confidence scores between 0.0 and 1.0 for each medication and the overall document:
   - 0.90 to 1.0: very clear, unambiguous text
   - 0.70 to 0.89: slightly messy handwriting or minor ambiguity
   - below 0.70: uncertain or hard-to-read handwriting
5. If the document is not a medical prescription or contains no readable medicines, return an empty medications array and a low overallConfidence (< 0.2).
6. Format dates as YYYY-MM-DD. If year, month, or day is uncertain or absent, set prescriptionDate to null.

Format the output strictly as a JSON object with this exact structure:
{
  "prescriptionDate": "YYYY-MM-DD" or null,
  "prescriberName": "string" or null,
  "overallConfidence": number between 0.0 and 1.0,
  "medications": [
    {
      "name": "string" or null,
      "strength": "e.g. 500 mg" or null,
      "dose": "e.g. 1 tablet" or null,
      "route": "e.g. oral" or null,
      "frequency": "e.g. twice daily / 1-0-1" or null,
      "duration": "e.g. 5 days / 30 days" or null,
      "instructions": "e.g. after meals / SOS" or null,
      "confidence": number between 0.0 and 1.0
    }
  ]
}`;

export class GeminiExtractionProvider implements ExtractionProvider {
  readonly name = "gemini-vision";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {
    if (!apiKey) {
      throw new Error("GeminiExtractionProvider requires a non-empty API key");
    }
  }

  async extract(input: ExtractionInput): Promise<unknown> {
    const base64Data = input.bytes.toString("base64");
    const mimeType = input.mimeType || "image/jpeg";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(50000),
      });
    } catch (err) {
      throw new Error(`Gemini API request failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new ExtractionUnrecognizedError();
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new ExtractionUnrecognizedError({ cause: err });
    }
  }
}
