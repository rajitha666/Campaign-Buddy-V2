#!/usr/bin/env node
// Screenshots + in-page accessibility/layout checks for the portal at several widths — so the UX/UI Architect can
// SEE the change instead of guessing from code. Uses the portal's own Playwright install; run against a stack from
// `fresh-stack up` (or any running portal). Logins come from the portal's e2e config and are never printed.
//
//   node scripts/agent/shoot.mjs --routes /dashboard,/staff [--widths 375,768,1280] [--login admin|supervisor|sponsor]
//        [--campaign "Radiance Q3 Push"] [--base http://localhost:5173] [--theme light|dark] [--out dir] [--root repo]
//
// Output: compact per-page summary on stdout; JPEGs + report.json in --out (default: a temp folder).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inPageChecks } from './lib/a11y-inpage.mjs';

process.noDeprecation = true;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const root = resolve(opt('--root', process.cwd()));
const base = opt('--base', 'http://localhost:5173').replace(/\/$/, '');
// Routes may be given with or without a leading slash. (Git Bash on Windows rewrites a leading "/x" into "C:/Program Files/Git/x":
// pass `dashboard,staff` or set MSYS_NO_PATHCONV=1.)
const routes = (opt('--routes', 'dashboard')).split(',').map((r) => r.trim()).filter(Boolean).map((r) => {
  if (/^[A-Za-z]:[\\/]/.test(r)) { console.error(`Route "${r}" was rewritten by your shell (Git Bash). Pass routes without a leading slash, e.g. --routes dashboard,staff, or set MSYS_NO_PATHCONV=1.`); process.exit(2); }
  return r.startsWith('/') ? r : `/${r}`;
});
const widths = (opt('--widths', '375,768,1280')).split(',').map(Number);
const persona = opt('--login', 'admin');
const campaign = opt('--campaign');
const colorScheme = opt('--theme', 'light');
const out = resolve(opt('--out', join(tmpdir(), 'campaign-buddy-shots', String(Date.now()))));
mkdirSync(out, { recursive: true });

const portal = join(root, 'campaign-buddy-portal');
let chromium;
try { ({ chromium } = createRequire(join(portal, 'package.json'))('@playwright/test')); }
catch { console.error(`Cannot load Playwright from ${portal}/node_modules — run "npm ci" there (and "npx playwright install chromium").`); process.exit(2); }

function credentials() {
  const src = readFileSync(join(portal, 'e2e', 'support', 'auth.ts'), 'utf8');
  const m = src.match(new RegExp(`${persona}:\\s*\\{\\s*username:\\s*"([^"]+)",\\s*password:\\s*"([^"]+)"`));
  if (!m) { console.error(`No "${persona}" login found in e2e/support/auth.ts`); process.exit(2); }
  return { username: m[1], password: m[2] };
}
const slug = (r) => r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';

const browser = await chromium.launch();
try {
  // log in once, reuse the session for every viewport
  const { username, password } = credentials();
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme });
  const lp = await loginCtx.newPage();
  await lp.goto(`${base}/login`, { waitUntil: 'load' });
  await lp.locator('input[type="text"]').fill(username);
  await lp.locator('input[type="password"]').fill(password);
  await lp.getByRole('button', { name: /sign in/i }).click();
  await lp.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => { console.error('Login did not reach /dashboard (is the stack up and seeded?).'); process.exit(3); });
  if (campaign) { await lp.locator('.topbar select').first().selectOption({ label: campaign }).catch(() => console.error(`Campaign "${campaign}" not found; using the default.`)); await lp.waitForTimeout(800); }
  const state = await loginCtx.storageState();
  await loginCtx.close();

  const report = []; const lines = [];
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme, storageState: state });
    for (const route of routes) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !document.querySelector('.skeleton-block'), null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      const file = join(out, `${slug(route)}-${w}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 62 });
      const checks = await page.evaluate(inPageChecks);
      report.push({ route, width: w, file, errors, ...checks });
      // compact line + top issues (dedup by rule+element)
      const byRule = {}; checks.issues.forEach((i) => { byRule[i.rule] = (byRule[i.rule] || 0) + (i.count || 1); });
      const sum = Object.entries(byRule).map(([r, n]) => `${r}×${n}`).join(', ') || 'none';
      lines.push(`${route} @${w}: overflow ${checks.overflow ? `YES (${checks.overflow.scrollWidth}>${checks.overflow.clientWidth})` : 'no'} | issues: ${sum} | console errors ${errors.length}  → ${file}`);
      const seen = new Set();
      for (const i of checks.issues) { const k = `${i.rule}|${i.el}`; if (seen.has(k) || seen.size >= 5) continue; seen.add(k); lines.push(`    - ${i.rule} ${i.el}${i.ratio ? ` ratio ${i.ratio} (need ${i.need}) "${i.sample}"` : ''}${i.w ? ` ${i.w}×${i.h}px` : ''}${i.from ? ` ${i.from}→${i.to}` : ''}`); }
      errors.slice(0, 2).forEach((e) => lines.push(`    ! console: ${e}`));
      await page.close();
    }
    await ctx.close();
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`shoot ${base} as ${persona} (${colorScheme}) — ${routes.length} route(s) × ${widths.length} width(s)\n${lines.join('\n')}\nfull report: ${join(out, 'report.json')}`);
} finally { await browser.close(); }
