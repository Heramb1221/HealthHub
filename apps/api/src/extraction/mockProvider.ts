import { FIXTURES, FIXTURE_MARKER } from "./fixtures.js";
import { ExtractionUnrecognizedError, type ExtractionInput, type ExtractionProvider } from "./types.js";

const MARKER = Buffer.from(FIXTURE_MARKER, "latin1");

/**
 * Deterministic provider for development and tests. It does NOT read real
 * prescriptions. It only recognises synthetic fixture documents (files that
 * contain `HEALTHHUB-SYNTHETIC-FIXTURE:<id>`) and returns that fixture's fixed
 * output. Any other file is refused, so it can never invent medications for a
 * real document. Output depends only on the file's bytes.
 */
export class MockExtractionProvider implements ExtractionProvider {
  readonly name = "mock-synthetic";

  async extract(input: ExtractionInput): Promise<unknown> {
    const at = input.bytes.indexOf(MARKER);
    if (at === -1) throw new ExtractionUnrecognizedError();

    const rest = input.bytes.subarray(at + MARKER.length, at + MARKER.length + 64).toString("latin1");
    const id = /^[a-z0-9-]+/.exec(rest)?.[0];
    const fixture = id ? FIXTURES[id] : undefined;
    if (!fixture) throw new ExtractionUnrecognizedError();

    // A deep copy, so callers can never mutate the shared fixture table.
    return structuredClone(fixture.raw);
  }
}
