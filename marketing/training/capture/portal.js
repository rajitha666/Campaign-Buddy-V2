// Re-shoot CB Office training screenshots against a locally running portal +
// backend, seeded with the "Radiance Q3 Push" demo campaign. See README.md.
//
// Usage:
//   node portal.js                # re-shoot everything in SHOTS
//   node portal.js sales-status    # only shots whose outfile contains this substring
import { chromium } from 'playwright';
import { shootToWebp } from './lib/webp.js';

const BASE_URL = process.env.PORTAL_URL || 'http://localhost:5173';
const CAMPAIGN_NAME = process.env.DEMO_CAMPAIGN || 'Radiance Q3 Push';
const VIEWPORT = { width: 1600, height: 1000 }; // matches the existing shots

const CREDENTIALS = {
  admin: { username: 'admin', password: 'ChangeMe123!' },
  supervisor: { username: 'supervisor', password: 'Portal123!' },
  sponsor: { username: 'sponsor', password: 'Portal123!' },
};

// Every shot is either a plain route (navigate + screenshot) or a named
// recipe below, for the handful of screens that need a filter set before
// there is anything worth screenshotting.
const SHOTS = [
  { persona: 'admin', route: '/activations', outfile: 'assets/portal-admin/07-activations.webp' },
  { persona: 'admin', route: '/staff/attendance', outfile: 'assets/portal-admin/12-staff-attendance.webp' },
  { persona: 'admin', route: '/sales/status', outfile: 'assets/portal-admin/22-sales-status.webp' },
  { persona: 'admin', route: '/sales/outlet-wise', outfile: 'assets/portal-admin/23-sales-outlet-wise.webp' },
  { persona: 'admin', recipe: 'salesUpdateAutofill', outfile: 'assets/portal-admin/24-sales-update.webp' },
  { persona: 'admin', recipe: 'trackingAllPromoters', outfile: 'assets/portal-admin/27-tracking-promoter.webp' },

  { persona: 'supervisor', route: '/sales/sku-wise', outfile: 'assets/portal-supervisor/07-sales-sku-wise.webp' },

  { persona: 'sponsor', route: '/dashboard', outfile: 'assets/portal-sponsor/01-dashboard.webp' },
  { persona: 'sponsor', route: '/sponsor/sales', outfile: 'assets/portal-sponsor/03-sponsor-sales.webp' },
  { persona: 'sponsor', route: '/reports/client-brand-wise', outfile: 'assets/portal-sponsor/06-reports-brand-wise.webp' },
  { persona: 'sponsor', route: '/staff/attendance', outfile: 'assets/portal-sponsor/07-attendance.webp' },
  { persona: 'sponsor', route: '/supervisor-attendance', outfile: 'assets/portal-sponsor/08-supervisor-attendance.webp' },
  { persona: 'sponsor', recipe: 'trackingAllPromoters', outfile: 'assets/portal-sponsor/09-tracking-promoter.webp' },
];

async function login(page, persona) {
  const { username, password } = CREDENTIALS[persona];
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

// The campaign switcher resets to campaignList[0] on every full page load
// (SPA route changes don't reload, but page.goto() does) — so this has to
// run after every navigation, not just once after login. Sponsor is locked
// to their one granted campaign, so this is a no-op for that persona.
async function selectCampaign(page, persona) {
  if (persona === 'sponsor') return;
  const select = page.locator('.campaign-switcher select');
  const current = await select.evaluate((el) => el.options[el.selectedIndex]?.textContent);
  if (current === CAMPAIGN_NAME) return;
  await select.selectOption({ label: CAMPAIGN_NAME });
  await page.waitForTimeout(500);
}

// Drives a SearchableSelect (components/SearchableSelect.jsx) inside the
// .filter-field whose <label> matches `fieldLabel`.
async function searchSelect(page, fieldLabel, optionText) {
  const field = page.locator('.filter-field', { hasText: fieldLabel }).first();
  const input = field.locator('.searchable-select input');
  await input.click();
  await input.fill(optionText);
  await page.locator('.searchable-select-option', { hasText: optionText }).first().click();
}

const RECIPES = {
  // Outlet-first auto-fill (issue #37): picking an outlet with one activation
  // fills Promoter + Activation on its own — that's the thing worth showing.
  // Nawala Retail Outlet has exactly one activation in the demo seed (just
  // Sanduni); Keells Rajagiriya and Arpico Dehiwala also carry a supervisor
  // visit "activation" at the same outlet, so those resolve to 2 matches and
  // the fields stay blank for a manual pick instead.
  async salesUpdateAutofill(page, persona) {
    await page.goto(`${BASE_URL}/sales/update`);
    await selectCampaign(page, persona);
    await searchSelect(page, 'Outlet', 'Nawala Retail Outlet');
    await page.waitForTimeout(400);
  },
  // Multi-promoter colour-coded trail map. Defaults to today — if the demo
  // seed was run on a different day, pass TRACKING_DATE=YYYY-MM-DD.
  async trackingAllPromoters(page, persona) {
    await page.goto(`${BASE_URL}/tracking/promoter`);
    await selectCampaign(page, persona);
    await searchSelect(page, 'Promoter', 'All Promoters');
    const date = process.env.TRACKING_DATE || new Date().toISOString().slice(0, 10);
    await page.locator('input[type="date"]').fill(date);
    await page.getByRole('button', { name: /load/i }).click();
    await page.waitForTimeout(1000); // map tiles + fit-bounds animation
  },
};

async function run() {
  const filter = process.argv[2];
  const shots = filter ? SHOTS.filter((s) => s.outfile.includes(filter)) : SHOTS;
  if (shots.length === 0) {
    console.error(`No shots match "${filter}"`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const byPersona = new Map();
  for (const shot of shots) {
    if (!byPersona.has(shot.persona)) byPersona.set(shot.persona, []);
    byPersona.get(shot.persona).push(shot);
  }

  for (const [persona, personaShots] of byPersona) {
    console.log(`\n== ${persona} ==`);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await login(page, persona);
    for (const shot of personaShots) {
      if (shot.recipe) {
        await RECIPES[shot.recipe](page, persona);
      } else {
        await page.goto(`${BASE_URL}${shot.route}`);
        await selectCampaign(page, persona);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
      }
      await shootToWebp(page, shot.outfile);
    }
    await context.close();
  }

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
