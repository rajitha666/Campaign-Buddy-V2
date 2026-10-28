import { test, expect } from "@playwright/test";
import { loginAs } from "./support/auth";

// Simplified menu (#116): task groups, one level, tabs inside pages, and the
// retired Archive pages still resolving through redirects.

test("admin menu has no Archive and no second level; grouped pages show tabs", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/dashboard");
  const sections = page.locator(".nav-section-toggle");
  await expect(sections).toHaveText(["Today", "Campaigns", "Setup", "People", "Reports", "Admin"]);
  await expect(page.locator(".nav-child")).toHaveCount(0);

  // one menu row opens the first tab and the siblings appear as tabs
  await page.getByRole("button", { name: "People" }).click();
  await page.locator(".nav-item", { hasText: /^Staff$/ }).click();
  await expect(page).toHaveURL(/\/staff$/);
  const tabs = page.getByRole("navigation", { name: /staff sections/i });
  await expect(tabs.getByRole("link")).toHaveText(["All staff", "Profiles"]);
  await tabs.getByRole("link", { name: "Profiles" }).click();
  await expect(page).toHaveURL(/\/staff\/profiles$/);
  await expect(tabs.getByRole("link", { name: "Profiles" })).toHaveAttribute("aria-current", "page");
  // the Staff row stays highlighted on its second tab
  await expect(page.locator(".nav-item.active")).toHaveText(/Staff/);
});

test("retired Archive URLs redirect for admin", async ({ page }) => {
  await loginAs(page, "admin");
  const cases: [string, RegExp][] = [
    ["/sales", /\/dashboard$/],
    ["/outlet-attendance", /\/supervisor-attendance$/],
    ["/promoter-list", /\/staff$/],
    ["/sponsor/sales", /\/sales\/sku-wise$/],
    ["/reports/client-brand-wise", /\/reports\/brand-wise$/],
  ];
  for (const [from, to] of cases) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
  }
});

test("sponsors keep their client report pages", async ({ page }) => {
  await loginAs(page, "sponsor");
  await page.goto("/sponsor/sales");
  await expect(page).toHaveURL(/\/sponsor\/sales$/);
  await expect(page.getByRole("navigation", { name: /client reports sections/i })).toBeVisible();
});
