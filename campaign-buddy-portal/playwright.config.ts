import { defineConfig, devices } from "@playwright/test";

// e2e/functional regression suite, run against a demo-seeded backend
// (campaign-buddy-backend/prisma/demo-seed.ts — "Radiance Q3 Push").
// Local: `npm run dev` in a separate terminal, then `npm run test:e2e`.
// CI: see ../.github/workflows/ci.yml (job "portal-e2e").
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
