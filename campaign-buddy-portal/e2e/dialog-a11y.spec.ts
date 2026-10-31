import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// Drawers behave as accessible dialogs (#129): labelled, focus moves in and
// stays in, Escape closes, and focus returns to the button that opened it.

test("Add New Member drawer: labelled, focus trapped, Escape closes and returns focus (#129)", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/staff");
  const opener = page.getByRole("button", { name: /add new member/i });
  await opener.click();

  const drawer = page.locator(".drawer.open[role=dialog]");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(drawer).toHaveAttribute("aria-labelledby", "drawer-title");

  // Focus moved inside the drawer, and Tab never leaves it.
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer.open")).toBeHidden();
  await expect(opener).toBeFocused();
});
