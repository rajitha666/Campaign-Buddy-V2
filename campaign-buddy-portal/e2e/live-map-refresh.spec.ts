import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// Marketing and the docs say Live Locations refreshes about every 15 seconds (#145).
test("Live Locations re-fetches positions about every 15 seconds", async ({ page }) => {
  await loginAs(page, "admin"); // on real time; the fake clock would stall the sign-in
  await page.clock.install();
  let calls = 0;
  page.on("request", (req) => { if (/\/tracking\/live(\?|$)/.test(req.url())) calls++; });
  await page.goto("/tracking/live");
  await expect.poll(() => calls).toBeGreaterThanOrEqual(1);

  const before = calls;
  await page.clock.runFor(14_000);
  expect(calls, "no refresh before 15 s").toBe(before);
  await page.clock.runFor(2_000); // 16 s in
  await expect.poll(() => calls).toBe(before + 1);
  await page.clock.runFor(15_000); // 31 s in
  await expect.poll(() => calls).toBe(before + 2);
});
