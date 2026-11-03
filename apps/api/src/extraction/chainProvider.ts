import { log } from "../lib/logger.js";
import type { ExtractionInput, ExtractionProvider } from "./types.js";

/** Medicines the primary reader must have found before we stop and accept its result. */
function hasUsableReading(raw: unknown): boolean {
  const meds = (raw as { medications?: unknown[] } | null)?.medications;
  return Array.isArray(meds) && meds.length > 0;
}

/**
 * Tries the primary provider first and only calls the fallback when the primary found no medicines or
 * failed outright (for example handwriting or a PDF). The fallback is an explicit, opt-in choice
 * because it sends the document to a third party.
 */
export class FallbackExtractionProvider implements ExtractionProvider {
  readonly name: string;

  constructor(
    private readonly primary: ExtractionProvider,
    private readonly fallback: ExtractionProvider,
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async extract(input: ExtractionInput): Promise<unknown> {
    return (await this.extractWithProvenance(input)).raw;
  }

  async extractWithProvenance(input: ExtractionInput): Promise<{ raw: unknown; provider: string }> {
    let primaryRaw: unknown;
    let primaryError: unknown;
    try {
      primaryRaw = await this.primary.extract(input);
      if (hasUsableReading(primaryRaw)) return { raw: primaryRaw, provider: this.primary.name };
    } catch (error) {
      primaryError = error;
    }

    log("info", "primary extraction found nothing usable, trying fallback", { primary: this.primary.name, fallback: this.fallback.name });
    try {
      return { raw: await this.fallback.extract(input), provider: this.fallback.name };
    } catch (fallbackError) {
      // Prefer the primary's (empty but honest) reading over failing; otherwise surface the real failure.
      if (primaryError === undefined) return { raw: primaryRaw, provider: this.primary.name };
      throw fallbackError instanceof Error ? fallbackError : primaryError;
    }
  }
}
