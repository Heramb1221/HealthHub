// Loads demo data. Needs DATABASE_URL, JWT_SECRET, and DEMO_SEED_PASSWORD (12+ characters).
// Refuses to run when NODE_ENV=production unless ALLOW_DEMO_SEED=true.
// Run with: npm run seed:demo
import { loadEnv } from "../src/config/env.js";
import { createDb } from "../src/db/client.js";
import { assertSeedAllowed, runDemoSeed } from "../src/seed/demoSeed.js";
import { LocalFileStore } from "../src/storage/localFileStore.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const password = assertSeedAllowed({
    nodeEnv: env.NODE_ENV,
    allowDemoSeed: process.env.ALLOW_DEMO_SEED === "true",
    password: process.env.DEMO_SEED_PASSWORD,
  });
  const db = createDb(env.DATABASE_URL);
  try {
    const summary = await runDemoSeed({ db, store: new LocalFileStore(env.STORAGE_DIR), env, password });
    process.stdout.write(`Demo data loaded: ${JSON.stringify(summary)}\n`);
    process.stdout.write("Demo accounts (all use DEMO_SEED_PASSWORD): admin@, provider@, patient1@, patient2@ demo.healthhub.test\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : "seed failed"}\n`);
  process.exit(1);
});
