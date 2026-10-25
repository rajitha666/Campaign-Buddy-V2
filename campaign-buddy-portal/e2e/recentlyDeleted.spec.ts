import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// #113 — a removed record shows up in Recently deleted with who/when, and Restore brings it back.

async function createCity(page: import("@playwright/test").Page, name: string) {
  const login = await page.request.post("/admin/v1/auth/login", { data: { username: "admin", password: "ChangeMe123!" } });
  const token = (await login.json()).data.accessToken;
  const res = await page.request.post("/admin/v1/cities", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, province: "E2E", district: "E2E" },
  });
  expect(res.ok()).toBe(true);
  return { token: token as string, id: (await res.json()).data.id as string };
}

test("a deleted city is listed with who deleted it, and Restore puts it back", async ({ page }) => {
  const name = `E2E Recently Deleted ${Date.now()}`;
  await loginAs(page, "admin");
  const { token, id } = await createCity(page, name);
  // delete through the API so this spec does not depend on how the list page confirms deletes
  const del = await page.request.delete(`/admin/v1/cities/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(del.ok()).toBe(true);

  await page.goto("/recently-deleted");
  await page.getByLabel("Search deleted records").fill(name);
  const row = page.locator("table tbody tr", { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("City");
  await expect(row).not.toContainText("—"); // the deleter and time are known for a fresh delete

  await row.getByRole("button", { name: `Restore ${name}` }).click();
  await expect(page.locator(".toast", { hasText: `Restored "${name}"` })).toBeVisible();
  await expect(page.locator("table tbody tr", { hasText: name })).toHaveCount(0);

  await page.goto("/cities");
  await expect(page.locator("table tbody tr", { hasText: name })).toBeVisible();
});

test("supervisors do not get the menu item and the API refuses them", async ({ page }) => {
  await loginAs(page, "supervisor");
  await expect(page.getByRole("link", { name: "Recently deleted" })).toHaveCount(0);
  const login = await page.request.post("/admin/v1/auth/login", { data: { username: "supervisor", password: "Portal123!" } });
  const token = (await login.json()).data.accessToken;
  const res = await page.request.get("/admin/v1/deleted", { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(403);
});
