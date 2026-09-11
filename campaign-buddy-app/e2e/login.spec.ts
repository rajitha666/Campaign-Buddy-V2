import { test, expect } from "@playwright/test";

// Mobile login seeded by campaign-buddy-backend/prisma/demo-seed.ts
// ("Radiance Q3 Push" — Sanduni Kumari, Nawala outlet).
const PROMOTER = { phone: "0771234567", password: "Field123!" };

test("promoter can sign in and land on Home", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  await page.getByPlaceholder("07X XXX XXXX").fill(PROMOTER.phone);
  await page.getByPlaceholder("Password").fill(PROMOTER.password);
  await page.getByText("Sign in", { exact: true }).click();

  // Home screen's "Today's stats" section header is time-of-day independent
  // (unlike the "Good morning/afternoon/evening" greeting above it).
  await expect(page.getByText("Today's stats")).toBeVisible({ timeout: 20_000 });
  expect(errors, `uncaught error after login: ${errors.join("; ")}`).toEqual([]);
});
