import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The suite shares one Postgres database and resets it between files, so it
    // must not run files in parallel.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
    setupFiles: ["test/setup.ts"],
  },
});
