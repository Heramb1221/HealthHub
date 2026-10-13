import { defineConfig } from "prisma/config";

// Load .env for Prisma CLI commands (Node 22+). A missing file is fine; CI and
// production set DATABASE_URL in the real environment.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
