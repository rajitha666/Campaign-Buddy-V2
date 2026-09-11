import { defineConfig, devices } from "@playwright/test";

// Mobile app e2e, run against the Expo *web* build (there's no simulator/
// emulator toolchain set up in this repo's dev environment yet — see
// README's "Known gaps" — so this covers the JS/React logic and layout,
// not native-only behavior like GPS or push notifications).
// Local: `EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/v1 npm run start -- --web`
// in one terminal, then `npm run test:e2e` in another.
// CI: see ../.github/workflows/ci.yml (job "app-e2e").
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
