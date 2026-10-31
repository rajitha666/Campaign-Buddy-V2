// Re-shoot CB Mobile training screenshots against a locally running Expo web
// build + backend, seeded with the "Radiance Q3 Push" demo campaign.
// See README.md. Read-only screens only (Performance, Sales, Today's stats) —
// this script deliberately does not drive check-in/check-out, edit stock or
// save a stats update, since those mutate the demo data every run.
//
// Usage:
//   node mobile.js
import { chromium } from 'playwright';
import { shootToWebp } from './lib/webp.js';

const BASE_URL = process.env.APP_URL || 'http://localhost:8081';
const VIEWPORT = { width: 640, height: 1100 }; // matches the existing shots
// Kasun (Radiance Q3 Push only) — not Sanduni/0771234567, who is on two
// campaigns and picks whichever one the app defaults to (MAINTENANCE.md).
const PROMOTER = { phone: process.env.PROMOTER_PHONE || '0762223344', password: 'Field123!' };

const SHOTS = [
  { tab: 'Performance', outfile: 'assets/mobile-promoter/07-performance.webp' },
  { tab: 'Sales', outfile: 'assets/mobile-promoter/05-sales-summary.webp' },
  // "Update today's stats" hangs off Home's stats tile, not a tab, so it needs
  // an `open` recipe. Shot at the original 2026-09 batch's 640x1385 device
  // viewport rather than full-page, so it matches the rest of the promoter
  // assets and keeps the bottom tab bar pinned where the other shots have it.
  // Still read-only: it opens the screen but never taps Update.
  {
    outfile: 'assets/mobile-promoter/06-stats-update.webp',
    viewport: { width: 640, height: 1385 },
    fullPage: false,
    open: async (page) => {
      await page.getByText('Home', { exact: true }).last().click();
      await page.getByText('Foot fall', { exact: true }).first().click();
      await page.getByText("Update today's stats").waitFor({ timeout: 20_000 });
    },
  },
];

async function login(page) {
  await page.goto(BASE_URL);
  await page.getByPlaceholder('07X XXX XXXX').fill(PROMOTER.phone);
  await page.getByPlaceholder('Password').fill(PROMOTER.password);
  await page.getByText('Sign in', { exact: true }).click();
  await page.getByText("Today's stats").waitFor({ timeout: 20_000 });
}

async function run() {
  const filter = process.argv[2];
  const shots = filter ? SHOTS.filter((s) => s.outfile.includes(filter)) : SHOTS;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await login(page);

  for (const shot of shots) {
    await page.setViewportSize(shot.viewport ?? VIEWPORT);
    if (shot.open) await shot.open(page);
    else await page.getByText(shot.tab, { exact: true }).last().click();
    await page.waitForTimeout(600);
    await shootToWebp(page, shot.outfile, { fullPage: shot.fullPage ?? true });
  }

  await context.close();
  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
