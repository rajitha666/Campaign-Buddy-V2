import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./support/auth";

// Progressive disclosure (#115): long forms show the essentials and tuck the
// rest into collapsible sections, without losing data or hiding errors.

const uniq = () => Date.now().toString().slice(-7);

async function openAddMember(page: Page) {
  await loginAs(page, "admin");
  await page.goto("/staff");
  await page.getByRole("button", { name: /add new member/i }).click();
  await expect(page.locator(".drawer.open")).toBeVisible();
}

async function fillEssentials(page: Page, n: string) {
  const d = page.locator(".drawer.open");
  await d.getByLabel("Employee ID").fill(`E2E-${n}`);
  await d.getByLabel("Full Name").fill(`Form Test ${n}`);
  await d.getByLabel("Mobile App Username").fill(`ft${n}`);
  await d.getByLabel("Password").fill("Passw0rd!x");
}

test("Add New Member opens with the essentials only; optional groups are collapsed", async ({ page }) => {
  await openAddMember(page);
  const d = page.locator(".drawer.open");
  const visibleControls = d.locator(".drawer-body").locator("input:visible, select:visible, textarea:visible");
  // 8 essentials: id, full name, display name, user type x2 radios are chips (not inputs), status chips, mobile, username, password
  expect(await visibleControls.count()).toBeLessThanOrEqual(8);
  for (const name of ["Personal details", "Emergency contact", "Bank details"]) {
    await expect(d.getByRole("button", { name: new RegExp(name) })).toHaveAttribute("aria-expanded", "false");
  }
  // display name follows full name until edited
  await d.getByLabel("Full Name").fill("Nimali Perera");
  await expect(d.getByLabel(/Display Name/)).toHaveValue("Nimali Perera");
  await d.getByLabel(/Display Name/).fill("Nimali");
  await d.getByLabel("Full Name").fill("Nimali P");
  await expect(d.getByLabel(/Display Name/)).toHaveValue("Nimali");
});

test("a section expands by keyboard and shows a filled-count summary", async ({ page }) => {
  await openAddMember(page);
  const d = page.locator(".drawer.open");
  const bank = d.getByRole("button", { name: /Bank details/ });
  await expect(bank).toContainText("0 of 4 filled");
  await bank.focus();
  await page.keyboard.press("Enter");
  await expect(bank).toHaveAttribute("aria-expanded", "true");
  await d.getByLabel("Bank", { exact: true }).fill("Test Bank");
  await expect(bank).toContainText("1 of 4 filled");
  await bank.focus();
  await page.keyboard.press("Space");
  await expect(bank).toHaveAttribute("aria-expanded", "false");
});

test("add with essentials only succeeds; editing keeps data from collapsed sections", async ({ page }) => {
  const n = uniq();
  await openAddMember(page);
  const d = page.locator(".drawer.open");
  await fillEssentials(page, n);
  await d.getByRole("button", { name: /Bank details/ }).click();
  await d.getByLabel("Bank", { exact: true }).fill("Keep Bank");
  await d.getByLabel("Account Number").fill("123456");
  await d.getByRole("button", { name: /Bank details/ }).click(); // collapse again before saving
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".drawer.open")).toBeHidden();

  // find the new row and edit just the name
  const row = page.locator("table tbody tr", { hasText: `Form Test ${n}` }).first();
  await expect(row).toBeVisible();
  await row.locator(".icon-btn.edit").click();
  const e = page.locator(".drawer.open");
  // the section with data starts open on edit; the empty ones stay closed
  await expect(e.getByRole("button", { name: /Bank details/ })).toHaveAttribute("aria-expanded", "true");
  await expect(e.getByRole("button", { name: /Emergency contact/ })).toHaveAttribute("aria-expanded", "false");
  await e.getByLabel("Full Name").fill(`Form Test ${n} Renamed`);
  await e.getByRole("button", { name: /Bank details/ }).click(); // collapse, then save
  await e.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".drawer.open")).toBeHidden();

  await page.locator("table tbody tr", { hasText: `E2E-${n}` }).first().locator(".icon-btn.edit").click();
  const again = page.locator(".drawer.open");
  await expect(again.getByLabel("Bank", { exact: true })).toHaveValue("Keep Bank");
  await expect(again.getByLabel("Account Number")).toHaveValue("123456");
});

test("an error inside a collapsed section re-opens it and focuses the field", async ({ page }) => {
  await openAddMember(page);
  const d = page.locator(".drawer.open");
  await fillEssentials(page, uniq());
  const emergency = d.getByRole("button", { name: /Emergency contact/ });
  await emergency.click();
  await d.getByLabel("Contact Phone").fill("12");
  await emergency.click(); // collapse with the bad value inside
  await expect(emergency).toHaveAttribute("aria-expanded", "false");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(emergency).toHaveAttribute("aria-expanded", "true");
  const field = d.getByLabel("Contact Phone");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  const describedBy = await field.getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toHaveAttribute("role", "alert");
});

test("inline validation fires on blur, before Save", async ({ page }) => {
  await openAddMember(page);
  const d = page.locator(".drawer.open");
  await d.getByLabel("Employee ID").focus();
  await d.getByLabel("Full Name").focus(); // leaves Employee ID blank
  await expect(d.locator("#err-employeeId")).toHaveText("Required");
});

test("campaign and outlet forms use the same sections", async ({ page }) => {
  await loginAs(page, "admin");
  for (const [path, section] of [["/outlets", /Contact and location/], ["/campaigns", /Description and options/]] as const) {
    await page.goto(path);
    await page.getByRole("button", { name: /add new/i }).first().click();
    await expect(page.locator(".drawer.open").getByRole("button", { name: section })).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator(".drawer.open")).toBeHidden();
  }
});
