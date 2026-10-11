import type { Env } from "../config/env.js";
import { MockExtractionProvider } from "./mockProvider.js";
import type { ExtractionProvider } from "./types.js";

/** Returns the configured provider, or null when extraction is disabled. */
export function createExtractionProvider(name: Env["EXTRACTION_PROVIDER"]): ExtractionProvider | null {
  switch (name) {
    case "mock":
      return new MockExtractionProvider();
    case "disabled":
      return null;
  }
}
