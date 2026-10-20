
export interface ExtractionInput {
  bytes: Buffer;
  mimeType: string;
}

export interface ExtractionProvider {

  readonly name: string;

  extract(input: ExtractionInput): Promise<unknown>;
}

export class ExtractionUnrecognizedError extends Error {
  constructor(options?: ErrorOptions) {
    super("input not recognised by extraction provider", options);
    this.name = "ExtractionUnrecognizedError";
  }
}
