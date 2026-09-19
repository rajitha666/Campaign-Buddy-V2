import { test, expect } from "@playwright/test";

// Multi-outlet promoters: when an admin gives one promoter two same-day outlets,
// Home must show an outlet picker and stay usable when an outlet is removed.
// Set-up/tear-down go through the admin API of the demo-seeded backend
// (prisma/demo-seed.ts — "Radiance Q3 Push", Sanduni Kumari).
const API = process.env.E2E_API_URL || "http://localhost:4000";
const ADMIN = { username: "admin", password: "ChangeMe123!" };
const PROMOTER = { phone: "0771234567", password: "Field123!" };

test.describe.configure({ mode: "serial" });

let auth: Record<string, string> = {};
let campaignId = "";
let extraActivationId = "";
let extraOutletName = "";
let baseline = 0;

const listOf = (body: any): any[] => (Array.isArray(body?.data) ? body.data : body?.data?.items ?? body?.data?.rows ?? []);

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/admin/v1/auth/login`, { data: ADMIN });
  expect(login.ok()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };

  const campaigns = listOf(await (await request.get(`${API}/admin/v1/campaigns`, { headers: auth })).json());
  campaignId = campaigns.find((c) => /Radiance/i.test(c.name)).id;

  const staff = listOf(await (await request.get(`${API}/admin/v1/staff?limit=200`, { headers: auth })).json());
  const sanduni = staff.find((s) => /Sanduni/i.test(s.fullName ?? s.displayName ?? ""));
  expect(sanduni, "demo promoter Sanduni exists").toBeTruthy();

  // What the promoter already holds today (the demo data can span campaigns).
  const mobile = await request.post(`${API}/v1/auth/login`, {
    data: { username: PROMOTER.phone, password: PROMOTER.password },
  });
  const mobileAuth = { Authorization: `Bearer ${(await mobile.json()).data.accessToken}` };
  const current = listOf(await (await request.get(`${API}/v1/me/assignments`, { headers: mobileAuth })).json());
  baseline = current.length;
  const usedOutlets = new Set(current.map((a) => a.outlet.id));
  const outlets = listOf(await (await request.get(`${API}/admin/v1/outlets?limit=200`, { headers: auth })).json());
  const spare = outlets.find((o) => !usedOutlets.has(o.id));
  expect(spare, "an outlet Sanduni is not yet assigned to").toBeTruthy();
  extraOutletName = spare.name;

  const today = new Date().toISOString().slice(0, 10);
  const created = await request.post(`${API}/admin/v1/campaigns/${campaignId}/activations`, {
    headers: auth,
    data: { name: "E2E second outlet", outletId: spare.id, staffId: sanduni.id, dateFrom: today, dateTo: today },
  });
  expect(created.status()).toBe(201);
  extraActivationId = (await created.json()).data.id;
});

test.afterAll(async ({ request }) => {
  if (extraActivationId) {
    await request.delete(`${API}/admin/v1/campaigns/${campaignId}/activations/${extraActivationId}`, { headers: auth });
  }
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder("07X XXX XXXX").fill(PROMOTER.phone);
  await page.getByPlaceholder("Password").fill(PROMOTER.password);
  await page.getByText("Sign in", { exact: true }).click();
  await expect(page.getByText("Today's stats")).toBeVisible({ timeout: 20_000 });
}

test("a promoter with two same-day outlets gets an outlet picker on Home", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);

  const chips = page.getByRole("button", { name: /^Use outlet / });
  await expect(chips).toHaveCount(baseline + 1);
  const second = page.getByRole("button", { name: `Use outlet ${extraOutletName}` });
  await expect(second).toBeVisible();
  await second.click();
  await expect(page.getByText("Today's stats")).toBeVisible();
  expect(errors, errors.join("; ")).toEqual([]);
});

test("removing the extra outlet drops the picker and Home still works", async ({ page, request }) => {
  const del = await request.delete(`${API}/admin/v1/campaigns/${campaignId}/activations/${extraActivationId}`, { headers: auth });
  expect(del.ok()).toBeTruthy();
  extraActivationId = "";

  await signIn(page);
  await expect(page.getByRole("button", { name: /^Use outlet / })).toHaveCount(baseline > 1 ? baseline : 0);
});
