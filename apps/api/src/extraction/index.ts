import type { Env } from "../config/env.js";
import { GeminiExtractionProvider } from "./geminiProvider.js";
import { MockExtractionProvider } from "./mockProvider.js";
import type { ExtractionProvider } from "./types.js";

export function createExtractionProvider(
  name: Env["EXTRACTION_PROVIDER"],
  geminiApiKey?: string,
  geminiModel?: string,
): ExtractionProvider | null {
  switch (name) {
    case "mock":
      return new MockExtractionProvider();
    case "gemini":
      return new GeminiExtractionProvider(geminiApiKey ?? "", geminiModel);
    case "disabled":
      return null;
  }
}
