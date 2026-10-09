import { createApp } from "./app.js";
import { EnvError, loadEnv } from "./config/env.js";
import { createDb, isDatabaseReachable } from "./db/client.js";
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

  const db = createDb(env.DATABASE_URL);
  const app = createApp(env, undefined, { checkDatabase: () => isDatabaseReachable(db) });
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

main();
