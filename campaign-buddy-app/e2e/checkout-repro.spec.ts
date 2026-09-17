import { test, expect } from "@playwright/test";

test("himesha can sign in and land on Home", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("07X XXX XXXX").fill("himesha");
  await page.getByPlaceholder("Password").fill("123");
  await page.getByText("Sign in", { exact: true }).click();
  await expect(page.getByText("Today's stats")).toBeVisible({ timeout: 30_000 });

  // navigate to Attendance tab
  await page.getByText("Attendance").first().click();

  await expect(page.getByText("Check out")).toBeVisible({ timeout: 20_000 });
  await page.getByText("Check out", { exact: true }).click();
  await page.getByText("Yes, check out").click();

  // capture dialog
  let dialogMsg = "";
  page.on("dialog", (d) => { dialogMsg = d.message(); d.dismiss(); });
  await page.waitForTimeout(12_000);
  console.log("DIALOG:", dialogMsg);
});
