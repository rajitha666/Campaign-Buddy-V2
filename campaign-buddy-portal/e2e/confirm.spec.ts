import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// Feedback system: destructive actions ask with a designed dialog (not the
// browser's window.confirm), and reversible ones act at once and offer Undo.

test("removing a client (dependants disappear with it) asks first; Esc and Cancel back out without deleting", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/clients");
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  let deleteCalls = 0;
  page.on("request", (r) => { if (r.method() === "DELETE") deleteCalls += 1; });
  const rowsBefore = await page.locator("table tbody tr").count();

  const dialog = page.getByRole("alertdialog");
  await page.locator("table tbody tr").first().locator(".icon-btn.delete").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".confirm-title")).toHaveText(/^Remove /);
  // destructive: the safe button has focus, so a stray Enter cannot delete
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  // focus stays inside the dialog while tabbing
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Remove client" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.locator("table tbody tr").first().locator(".icon-btn.delete").click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  expect(deleteCalls).toBe(0);
  await expect(page.locator("table tbody tr")).toHaveCount(rowsBefore);
});

test("resetting personalization acts at once and Undo brings the favorites back", async ({ page }) => {
  // Supervisor account: keeps clear of the admin favorites other specs toggle in parallel.
  await loginAs(page, "supervisor");
  const favLabel = page.locator(".nav-section-label", { hasText: "Favorites" });
  const isPut = (r: import("@playwright/test").Response) => r.url().includes("/me/preferences") && r.request().method() === "PUT";

  const saved = page.waitForResponse(isPut);
  await page.getByRole("button", { name: "Add Dashboard to favorites" }).first().click({ force: true });
  expect((await saved).ok()).toBe(true);
  await expect(favLabel).toBeVisible();

  await page.goto("/personalization");
  await page.getByRole("button", { name: "Reset all" }).click();
  // no confirmation dialog — it just happens, with an Undo
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const toast = page.locator(".toast", { hasText: "Personalization reset" });
  await expect(toast).toBeVisible();
  await expect(favLabel).toBeHidden();

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(favLabel).toBeVisible();

  // leave the shared demo account as we found it
  const cleared = page.waitForResponse(isPut);
  await page.getByRole("button", { name: "Remove Dashboard from favorites" }).first().click({ force: true });
  await cleared;
});

// #112 — reversible deletes act at once and offer Undo (no "Are you sure?").
async function createCity(page: import("@playwright/test").Page, name: string) {
  const login = await page.request.post("/admin/v1/auth/login", { data: { username: "admin", password: "ChangeMe123!" } });
  const token = (await login.json()).data.accessToken;
  const res = await page.request.post("/admin/v1/cities", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, province: "E2E", district: "E2E" },
  });
  expect(res.ok()).toBe(true);
}

test("deleting a city acts at once with a named Undo toast; Undo brings the row back", async ({ page }) => {
  const name = `E2E Undo City ${Date.now()}`;
  await loginAs(page, "admin");
  await createCity(page, name);
  await page.goto("/cities");
  const row = page.locator("table tbody tr", { hasText: name });
  await expect(row).toBeVisible();

  await row.locator(".icon-btn.delete").click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0); // no confirmation
  const toast = page.locator(".toast", { hasText: `Removed "${name}"` });
  await expect(toast).toBeVisible();
  await expect(row).toHaveCount(0);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".toast", { hasText: `Restored "${name}"` })).toBeVisible();
  await expect(row).toBeVisible();
});

test("if the Undo toast is left to expire, the deleted row stays gone", async ({ page }) => {
  test.setTimeout(60_000);
  const name = `E2E Expire City ${Date.now()}`;
  await loginAs(page, "admin");
  await createCity(page, name);
  await page.goto("/cities");
  const row = page.locator("table tbody tr", { hasText: name });
  await row.locator(".icon-btn.delete").click();
  const toast = page.locator(".toast", { hasText: `Removed "${name}"` });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 15_000 }); // 7s dwell, then it goes
  await page.reload();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await expect(row).toHaveCount(0);
});
