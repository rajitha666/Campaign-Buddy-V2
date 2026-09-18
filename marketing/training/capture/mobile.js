// Re-shoot CB Mobile training screenshots against a locally running Expo web
// build + backend, seeded with the "Radiance Q3 Push" demo campaign.
// See README.md. Read-only screens only (Performance, Sales) — this script
// deliberately does not drive check-in/check-out or edit stock, since those
// mutate the demo data every run.
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
    await page.getByText(shot.tab, { exact: true }).last().click();
    await page.waitForTimeout(600);
    await shootToWebp(page, shot.outfile);
  }

  await context.close();
  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
