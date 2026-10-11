import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one test database and reset it, so files run one at a time.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    env: { NODE_ENV: "test" },
  },
});
