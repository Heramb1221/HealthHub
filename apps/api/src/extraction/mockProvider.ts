import { FIXTURES, FIXTURE_MARKER } from "./fixtures.js";
import { ExtractionUnrecognizedError, type ExtractionInput, type ExtractionProvider } from "./types.js";

const MARKER = Buffer.from(FIXTURE_MARKER, "latin1");

export class MockExtractionProvider implements ExtractionProvider {
  readonly name = "mock-synthetic";

  async extract(input: ExtractionInput): Promise<unknown> {
    const at = input.bytes.indexOf(MARKER);
    if (at === -1) throw new ExtractionUnrecognizedError();

    const rest = input.bytes.subarray(at + MARKER.length, at + MARKER.length + 64).toString("latin1");
    const id = /^[a-z0-9-]+/.exec(rest)?.[0];
    const fixture = id ? FIXTURES[id] : undefined;
    if (!fixture) throw new ExtractionUnrecognizedError();

    return structuredClone(fixture.raw);
  }
}
