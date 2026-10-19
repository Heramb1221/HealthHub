import { createApp } from "./app.js";
import { EnvError, loadEnv } from "./config/env.js";
import { createDb, isDatabaseReachable } from "./db/client.js";
import { createExtractionProvider } from "./extraction/index.js";
import { LocalFileStore } from "./storage/localFileStore.js";
import { log } from "./lib/logger.js";

function main(): void {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  if (env.DEV_AUTH_ENABLED) {
    log("warn", "DEVELOPMENT-ONLY login is enabled (DEV_AUTH_ENABLED=true); never use this in production");
  }

  if (env.EXTRACTION_PROVIDER === "mock") {
    log("warn", "extraction provider is the synthetic-only mock; real prescriptions cannot be processed");
  } else if (env.EXTRACTION_PROVIDER === "gemini") {
    log("info", "extraction provider is gemini-vision; real prescriptions will be extracted via Gemini Vision");
  }

  const db = createDb(env.DATABASE_URL);
  const app = createApp(env, undefined, {
    db,
    store: new LocalFileStore(env.STORAGE_DIR),
    extraction: createExtractionProvider(env.EXTRACTION_PROVIDER, env.GEMINI_API_KEY, env.GEMINI_MODEL),
    checkDatabase: () => isDatabaseReachable(db),
  });
  const server = app.listen(env.PORT, () => {
    log("info", "api listening", { port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = (): void => {
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Server entrypoint with Google Calendar OAuth & Resend integration
main();

