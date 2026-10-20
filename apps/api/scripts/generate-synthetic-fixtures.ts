
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES } from "../src/extraction/fixtures.js";
import { buildSyntheticPdf } from "../src/extraction/syntheticDocuments.js";

const dir = join(import.meta.dirname, "..", "fixtures", "synthetic");
mkdirSync(dir, { recursive: true });
for (const id of Object.keys(FIXTURES)) {
  writeFileSync(join(dir, `${id}.pdf`), buildSyntheticPdf(id));
  process.stdout.write(`wrote fixtures/synthetic/${id}.pdf\n`);
}
