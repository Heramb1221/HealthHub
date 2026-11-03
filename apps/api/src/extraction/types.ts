
export interface ExtractionInput {
  bytes: Buffer;
  mimeType: string;
}

export interface ExtractionProvider {

  readonly name: string;

  extract(input: ExtractionInput): Promise<unknown>;

  /**
   * Optional: like `extract`, but also reports which engine actually produced the result. Providers
   * that delegate to several engines implement this so the stored provenance is accurate.
   */
  extractWithProvenance?(input: ExtractionInput): Promise<{ raw: unknown; provider: string }>;
}

export class ExtractionUnrecognizedError extends Error {
  constructor(options?: ErrorOptions) {
    super("input not recognised by extraction provider", options);
    this.name = "ExtractionUnrecognizedError";
  }
}
