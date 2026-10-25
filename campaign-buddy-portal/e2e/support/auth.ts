import { Page, expect } from "@playwright/test";

// Portal logins seeded by campaign-buddy-backend/prisma/demo-seed.ts
// ("Radiance Q3 Push" — see marketing/training/MAINTENANCE.md).
export const CREDENTIALS = {
  admin: { username: "admin", password: "ChangeMe123!" },
  supervisor: { username: "supervisor", password: "Portal123!" },
  sponsor: { username: "sponsor", password: "Portal123!" },
} as const;

export type Persona = keyof typeof CREDENTIALS;

// Sidebar sections start folded unless they hold the current page, so a test that
// clicks a menu item has to open its section first. No-op if it is already open
// (or the section has no toggle — e.g. the icon-only rail shows everything).
export async function openNavSection(page: Page, section: string) {
  const toggle = page.locator(".nav-section-toggle", { hasText: section }).first();
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

export async function loginAs(page: Page, persona: Persona) {
  const { username, password } = CREDENTIALS[persona];
  await page.goto("/login");
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
