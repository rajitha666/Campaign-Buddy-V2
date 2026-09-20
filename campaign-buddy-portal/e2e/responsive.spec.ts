import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// Covers the phone/tablet layout added for touch use: the off-canvas nav
// drawer (phones), the tap-to-open icon-rail flyout (tablets, where hover
// never fires), and the stacked-card fallback for DataTable-driven lists.

test.describe("phone viewport (375x812)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("sidebar is off-canvas by default and opens via the hamburger button", async ({ page }) => {
    await loginAs(page, "admin");

    // Off-canvas: not visible until opened.
    await expect(page.locator(".sidebar")).not.toBeInViewport();
    await expect(page.locator(".hamburger-btn")).toBeVisible();

    await page.locator(".hamburger-btn").click();
    await expect(page.locator(".sidebar")).toBeInViewport();
    await expect(page.locator(".mobile-nav-backdrop")).toBeVisible();

    // Clicking a route closes the drawer and navigates.
    // .first(): the favorites e2e can pin Clients on this shared admin account
    // while this test runs in parallel, which adds a second matching nav item.
    await page.locator(".nav-item", { hasText: "Clients" }).first().click();
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.locator(".sidebar")).not.toBeInViewport();
  });

  test("tapping the backdrop closes the drawer without navigating", async ({ page }) => {
    await loginAs(page, "admin");
    await page.locator(".hamburger-btn").click();
    await expect(page.locator(".sidebar")).toBeInViewport();

    await page.locator(".mobile-nav-backdrop").click({ position: { x: 350, y: 20 } });
    await expect(page.locator(".sidebar")).not.toBeInViewport();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a resource list renders as stacked cards, not a table", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/outlets");

    await expect(page.locator(".data-card").first()).toBeVisible();
    await expect(page.locator(".table-scroll")).toBeHidden();
  });
});

test.describe("tablet viewport (768x1024)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("sidebar auto-collapses to an icon rail, opened by tap not hover", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page.locator("#app-shell")).toHaveClass(/nav-collapsed/);

    const group = page.locator(".nav-group", { hasText: "Campaigns" }).first();
    await group.locator(".nav-item").click();
    await expect(group.locator(".nav-children .nav-child", { hasText: "List" })).toBeVisible();
  });

  test("tables stay real (scrollable) tables, not cards, above phone width", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/outlets");
    await expect(page.locator("table.data-table tbody tr").first()).toBeVisible();
    await expect(page.locator(".table-cards")).toBeHidden();
  });
});
