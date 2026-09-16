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


// Issue #30 — outlet dropdown on Staff Attendance "could not be selected".
// In real sessions the failure modes were: re-clicking the (already focused)
// input never re-opened the menu because onFocus doesn't re-fire once the
// document-level close ran, and there was no keyboard path — typing a name and
// pressing Enter did nothing, so the value never registered. There was also no
// visible dropdown affordance (issue #34 class).
test("staff attendance outlet dropdown: reopen on click, keyboard select, and filter applies (issue #30)", async ({ page }) => {
  await loginAs(page, "admin");
  // Use the demo campaign explicitly — the DB may hold other campaigns with
  // no attendance data.
  await page.locator(".topbar select").first().selectOption({ label: "Radiance Q3 Push" });
  // client-side navigation (a full page reload resets the selected campaign);
  // "Staff" opens its flyout, "Attendance" navigates.
  await page.locator(".nav-item", { hasText: "Staff" }).first().click();
  await page.locator(".nav-child", { hasText: "Attendance" }).first().click();
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  const select = page.locator(".filter-bar .searchable-select input").first();

  // A visible affordance: the select control shows a caret, not a bare input.
  await expect(page.locator(".searchable-select .searchable-select-caret").first()).toBeVisible();

  // Select the outlet with the seeded attendance data ("Nawala Retail Outlet").
  await select.click();
  await select.fill("Nawala Retail");
  await page.keyboard.press("Enter");
  await expect(select).toHaveValue(/Nawala/, { timeout: 5000 });

  // The table reloads filtered to that outlet's rows.
  await page.waitForTimeout(1500);
  const outlets = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
  expect(outlets.length).toBeGreaterThan(0);
  for (const o of outlets) expect(o).toContain("Nawala");

  // clear the filter and ensure the table reloads — the control is still usable
  await select.click();
  await page.locator(".filter-bar .searchable-select-menu .searchable-select-option").first().click();
  await expect(page.locator(".table-card").first()).toBeVisible({ timeout: 10000 });
});


// Issue #27 — the table search bar: (a) typing one char re-fetched the table,
// which UNMOUNTED the DataTable and stole focus mid-typing; (b) navigating
// between two table screens kept the previous screen's search text, because
// both routes render the same <ResourcePage> component instance and React
// preserves its state.
test("table search: keeps focus while typing and does not carry text across tables (issue #27)", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/outlets");
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  const search = page.locator(".search-box input");
  await search.click();
  await page.keyboard.type("Nawala");
  // focus survives each keystroke's reload (used to be lost after 1 char)
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Nawala");
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  // switch to another table — search must not carry over
  await page.locator(".nav-item", { hasText: "Staff" }).first().click();
  await page.locator(".nav-child", { hasText: "List" }).first().click();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await expect(page.locator(".search-box input")).toHaveValue("");
});

