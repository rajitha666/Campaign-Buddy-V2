import { Page, expect } from "@playwright/test";

// Portal logins seeded by campaign-buddy-backend/prisma/demo-seed.ts
// ("Radiance Q3 Push" — see marketing/training/MAINTENANCE.md).
export const CREDENTIALS = {
  admin: { username: "admin", password: "ChangeMe123!" },
  supervisor: { username: "supervisor", password: "Portal123!" },
  sponsor: { username: "sponsor", password: "Portal123!" },
} as const;

export type Persona = keyof typeof CREDENTIALS;

export async function loginAs(page: Page, persona: Persona) {
  const { username, password } = CREDENTIALS[persona];
  await page.goto("/login");
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
