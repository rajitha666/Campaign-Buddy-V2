import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// Each spec here pins a specific bug that shipped and got fixed, so it can't
// silently come back. Not a substitute for the smoke suite's broad coverage.

test("leave request approve/decline buttons render an icon, not a blank button (regression for 67a23e5)", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/leave-requests");

  const approveButtons = page.locator(".icon-btn.approve");
  await expect(approveButtons.first()).toBeVisible();
  const count = await approveButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(approveButtons.nth(i).locator("svg")).toHaveCount(1);
    await expect(page.locator(".icon-btn.decline").nth(i).locator("svg")).toHaveCount(1);
  }
});

test("activations table shows outlet/promoter names, not raw ids (regression for 6ec099f)", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/activations");

  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  // demo-seed.ts ids are cuids: long, lowercase-alphanumeric, no spaces.
  // A friendly name ("Nawala Retail Outlet", "Kasun Perera") never matches this.
  const looksLikeRawId = /^[a-z0-9]{20,}$/;
  for (let i = 0; i < rowCount; i++) {
    const cellTexts = await rows.nth(i).locator("td").allTextContents();
    for (const cell of cellTexts.map((c) => c.trim()).filter(Boolean)) {
      expect(looksLikeRawId.test(cell), `cell looks like a raw id: "${cell}"`).toBe(false);
    }
  }
});
