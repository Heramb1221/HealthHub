import { createApp } from "./app.js";
import { EnvError, loadEnv } from "./config/env.js";
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

  const app = createApp(env);
  app.listen(env.PORT, () => {
    log("info", "api listening", { port: env.PORT, env: env.NODE_ENV });
  });
}

main();
