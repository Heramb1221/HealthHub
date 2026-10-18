/**
 * An extraction provider turns an uploaded prescription file into candidate
 * fields. Its output is UNTRUSTED: it always passes through the safety gate
 * (modules/prescriptions/safetyGate.ts) before anything is stored, and it can
 * never produce a verified or authoritative result.
 */
export interface ExtractionInput {
  bytes: Buffer;
  mimeType: string;
}

export interface ExtractionProvider {
  /** Stored with every version it produces, so output is always traceable to its source. */
  readonly name: string;
  /** Returns raw, unvalidated output. Throws ExtractionUnrecognizedError if the input cannot be handled. */
  extract(input: ExtractionInput): Promise<unknown>;
}

/** The provider does not recognise this input (for example a real document given to the synthetic-only mock). */
export class ExtractionUnrecognizedError extends Error {
  constructor(options?: ErrorOptions) {
    super("input not recognised by extraction provider", options);
    this.name = "ExtractionUnrecognizedError";
  }
}
