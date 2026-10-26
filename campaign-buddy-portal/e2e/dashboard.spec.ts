import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// #114 — attention-first Overview, one summary request per load.

test("admin Overview: attention strip, comparison tiles and last sales day, from one summary request", async ({ page }) => {
  const summaryCalls: string[] = [];
  page.on("request", (r) => { if (/\/campaigns\/[^/]+\/dashboard$/.test(r.url())) summaryCalls.push(r.url()); });
  await loginAs(page, "admin");

  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
  for (const label of ["Sales today", "Active outlets", "Conversion", "Customers approached"]) {
    await expect(page.locator(".stat-card .l", { hasText: label }).first()).toBeVisible();
  }
  await expect(page.getByText(/^Last sales day/)).toBeVisible();
  // One summary call per load (the old page made seven plus a paged walk of every sales row).
  expect(summaryCalls.length).toBe(1);
});

test("sponsor Overview shows performance only: no attention strip, no map", async ({ page }) => {
  const staffCalls: string[] = [];
  page.on("request", (r) => { if (/\/tracking\/live|\/activations/.test(r.url())) staffCalls.push(r.url()); });
  await loginAs(page, "sponsor");

  await expect(page.locator(".stat-card .l", { hasText: "Sales today" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await expect(page.getByText("Outlets & live sales staff")).toHaveCount(0);
  expect(staffCalls, "sponsor must not load staff/location data").toEqual([]);
});

test("Overview has no horizontal overflow at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAs(page, "admin");
  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
