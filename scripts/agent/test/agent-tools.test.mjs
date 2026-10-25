import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, profileFiles, parseAdded, scanAdded, coverageFlags } from '../lib/profile.mjs';
import { indexDoc, findSections, narrowHits, sliceSection } from '../lib/sections.mjs';
import { summarize, formatSummary } from '../lib/summarize.mjs';

// ---------- change profile ----------
test('classifyPath recognises areas, tests, UI, contract and schema files', () => {
  assert.equal(classifyPath('campaign-buddy-portal/src/components/Sidebar.jsx').ui, true);
  assert.equal(classifyPath('campaign-buddy-portal/src/lib/csv.js').ui, false); // logic, not a screen
  assert.equal(classifyPath('campaign-buddy-portal/src/lib/csv.test.js').isTest, true);
  assert.equal(classifyPath('campaign-buddy-portal/e2e/smoke.spec.ts').isTest, true);
  assert.equal(classifyPath('campaign-buddy-backend/src/modules/admin/catalog.routes.ts').contract, true);
  assert.equal(classifyPath('campaign-buddy-backend/prisma/migrations/20261025_x/migration.sql').schema, true);
  assert.equal(classifyPath('campaign-buddy-app/src/offline/queue.ts').sync, true);
  assert.equal(classifyPath('marketing/training/admin.html').area, 'guides');
  assert.equal(classifyPath('.claude/agents/qa-verifier.md').area, 'agents');
});

test('profileFiles routes a change to the right reviewers (full mode)', () => {
  const ui = profileFiles(['campaign-buddy-portal/src/pages/Dashboard.jsx']);
  assert.deepEqual(ui.reviewers, ['UX/UI', 'QA', 'Docs']);
  const be = profileFiles(['campaign-buddy-backend/src/modules/admin/catalog.routes.ts']);
  assert.deepEqual(be.reviewers, ['Architect', 'QA']);
  assert.equal(be.risky, true);
  const both = profileFiles(['campaign-buddy-portal/src/pages/Dashboard.jsx', 'campaign-buddy-backend/src/modules/admin/catalog.routes.ts']);
  assert.deepEqual(both.reviewers, ['Architect', 'UX/UI', 'QA', 'Docs']);
  assert.deepEqual(profileFiles(['docs/product-documentation.md']).reviewers, ['Docs']);
  assert.deepEqual(profileFiles(['marketing/capability-brief.html']).reviewers, ['Marketing']);
  assert.deepEqual(profileFiles(['campaign-buddy-portal/src/lib/csv.test.js']).reviewers, ['QA']);
  assert.deepEqual(profileFiles(['.github/workflows/ci.yml']).reviewers, ['Architect']);
});

test('major adds Marketing; light and off shrink the list', () => {
  const f = ['campaign-buddy-portal/src/pages/Dashboard.jsx', 'campaign-buddy-backend/src/modules/admin/catalog.routes.ts'];
  assert.ok(profileFiles(f, { major: true }).reviewers.includes('Marketing'));
  assert.deepEqual(profileFiles(f, { mode: 'off' }).reviewers, []);
  // light: QA always; Architect only if major/risky (a route file is risky); UX only if major; no Docs
  assert.deepEqual(profileFiles(f, { mode: 'light' }).reviewers, ['Architect', 'QA']);
  assert.deepEqual(profileFiles(['campaign-buddy-portal/src/pages/Dashboard.jsx'], { mode: 'light' }).reviewers, ['QA']);
  assert.deepEqual(profileFiles(['campaign-buddy-portal/src/pages/Dashboard.jsx'], { mode: 'light', major: true }).reviewers, ['UX/UI', 'QA', 'Marketing']);
});

// ---------- diff scanning ----------
const DIFF = [
  'diff --git a/campaign-buddy-portal/src/styles/app.css b/campaign-buddy-portal/src/styles/app.css',
  '--- a/campaign-buddy-portal/src/styles/app.css',
  '+++ b/campaign-buddy-portal/src/styles/app.css',
  '@@ -10,0 +11,2 @@',
  '+.x { color:#FFB98F; font-size:12px; }',
  '+.y { color:var(--ink); }',
  'diff --git a/campaign-buddy-portal/src/pages/A.jsx b/campaign-buddy-portal/src/pages/A.jsx',
  '--- a/campaign-buddy-portal/src/pages/A.jsx',
  '+++ b/campaign-buddy-portal/src/pages/A.jsx',
  '@@ -5 +5,2 @@',
  "+  if (!window.confirm('Sure?')) return;",
  "+  const price = 'LKR ' + n;",
  'diff --git a/campaign-buddy-backend/src/modules/admin/x.routes.ts b/campaign-buddy-backend/src/modules/admin/x.routes.ts',
  '--- a/campaign-buddy-backend/src/modules/admin/x.routes.ts',
  '+++ b/campaign-buddy-backend/src/modules/admin/x.routes.ts',
  '@@ -1,0 +20,3 @@',
  '+router.post("/things/:id/restore", requireRole("adm"), async (req, res) => {',
  '+  const rows = await prisma.client.findMany({ where: { name: "a" } });',
  '+});',
  'diff --git a/campaign-buddy-backend/prisma/migrations/1_x/migration.sql b/campaign-buddy-backend/prisma/migrations/1_x/migration.sql',
  '--- /dev/null',
  '+++ b/campaign-buddy-backend/prisma/migrations/1_x/migration.sql',
  '@@ -0,0 +1,2 @@',
  '+ALTER TABLE "clients" DROP COLUMN "old";',
  '+ALTER TABLE "clients" ADD COLUMN "n" TEXT;',
].join('\n');

test('parseAdded tracks file and line numbers', () => {
  const a = parseAdded(DIFF);
  assert.deepEqual(a[0], { file: 'campaign-buddy-portal/src/styles/app.css', line: 11, text: '.x { color:#FFB98F; font-size:12px; }' });
  assert.equal(a[1].line, 12);
  assert.ok(a.some((x) => x.file.endsWith('A.jsx') && x.line === 5));
});

test('scanAdded flags the mechanical problems and ignores clean lines', () => {
  const f = scanAdded(parseAdded(DIFF), { softDeleteModels: ['client'] });
  assert.equal(f.colors.length, 1); assert.match(f.colors[0], /#FFB98F/);
  assert.equal(f.fontPx.length, 1);
  assert.equal(f.nativeDialogs.length, 1);
  assert.equal(f.locale.length, 1); assert.match(f.locale[0], /A\.jsx:6/);
  assert.equal(f.routes.length, 1);
  assert.equal(f.migrationRisk.length, 1);
  assert.equal(f.softDelete.length, 1); assert.match(f.softDelete[0], /prisma\.client\.findMany/);
});

test('token definitions and tests are not flagged; a filtered soft-delete read is fine', () => {
  const diff = [
    '+++ b/campaign-buddy-portal/src/styles/tokens.css', '@@ -1,0 +1,1 @@', '+  --ink:#12241F;',
    '+++ b/campaign-buddy-portal/src/lib/x.test.js', '@@ -1,0 +1,1 @@', "+  expect(fmt('LKR 5')).toBe('x')",
    '+++ b/campaign-buddy-backend/src/modules/admin/y.routes.ts', '@@ -1,0 +1,2 @@',
    '+const rows = await prisma.client.findMany({', '+  where: { deletedAt: null } });',
  ].join('\n');
  const f = scanAdded(parseAdded(diff), { softDeleteModels: ['client'] });
  assert.equal(f.colors.length + f.locale.length + f.softDelete.length, 0);
});

test('coverageFlags reports missing tests, guides, api doc and MCP coverage', () => {
  const infos = ['campaign-buddy-portal/src/pages/A.jsx', 'campaign-buddy-backend/src/modules/admin/x.routes.ts'].map((p) => ({ path: p, ...classifyPath(p) }));
  const c = coverageFlags(infos, { routesTouched: true });
  assert.equal(c.length, 4);
  const ok = ['campaign-buddy-portal/src/pages/A.jsx', 'campaign-buddy-portal/src/pages/A.test.js', 'marketing/training/admin.html'].map((p) => ({ path: p, ...classifyPath(p) }));
  assert.deepEqual(coverageFlags(ok), []);
});

// ---------- doc sections ----------
const MD = ['# Title', 'intro', '## 5. Sales', 'a', '### 5.9 Live tracking', 'b', 'c', '## 6. Reports', 'd', '```', '# not a heading', '```', ''].join('\n');

test('indexDoc finds headings (skipping code fences) with section ends', () => {
  const idx = indexDoc(MD, 'md');
  assert.deepEqual(idx.map((h) => h.title), ['Title', '5. Sales', '5.9 Live tracking', '6. Reports']);
  assert.equal(idx[1].end, 7); // ## 5. Sales runs to the line before ## 6.
  assert.equal(idx[2].end, 7);
});

test('findSections matches by text or by section number; sliceSection truncates visibly', () => {
  const idx = indexDoc(MD, 'md');
  assert.equal(findSections(idx, 'live track')[0].title, '5.9 Live tracking');
  assert.equal(findSections(idx, '5.9')[0].title, '5.9 Live tracking');
  assert.deepEqual(findSections(idx, '5').map((h) => h.title), ['5. Sales']); // "5" must not match "5.9" only by prefix of a different number
  const long = ['## A', ...Array(300).fill('x')].join('\n');
  const h = indexDoc(long, 'md')[0];
  const s = sliceSection(long, h, 50);
  assert.equal(s.truncated, true); assert.match(s.text, /truncated: 251 more lines/);
});


test('narrowHits prefers the specific section over a title that merely contains the word', () => {
  const doc = ['# Agent team - roster and verdict contract', 'intro', '## Roster', 'x', '## Verdict contract (all roles)', 'y', '## Other', 'z'].join('\n');
  const hits = narrowHits(findSections(indexDoc(doc, 'md'), 'verdict'), 'verdict');
  assert.deepEqual(hits.map((h) => h.title), ['Verdict contract (all roles)']); // not the whole-file H1
  const nested = indexDoc(['## A thing', '### A thing detail', 'text'].join('\n'), 'md');
  assert.deepEqual(narrowHits(findSections(nested, 'thing'), 'thing').map((h) => h.title), ['A thing detail']) // innermost match wins;
});

test('indexDoc handles HTML headings', () => {
  const html = '<h1>Admin guide</h1>\n<p>x</p>\n<h2 id="a">Open <b>Staff</b> &amp; more</h2>\n';
  assert.deepEqual(indexDoc(html, 'html').map((h) => h.title), ['Admin guide', 'Open Staff & more']);
});

// ---------- output summaries ----------
test('summarize reads vitest, playwright and tsc output', () => {
  const v = summarize('\u001b[32m ✓\u001b[39m a.test.js\n Test Files  25 passed (25)\n      Tests  167 passed (167)\n', 0);
  assert.ok(v.ok); assert.deepEqual(v.facts, ['vitest files: 25 passed (25)', 'vitest tests: 167 passed (167)']);
  const p = summarize('  1 failed\n    [chromium] › e2e/a.spec.ts:7:1 › leave request\n  13 passed (59s)\n', 1);
  assert.equal(p.ok, false); assert.match(p.facts[0], /13 passed/); assert.match(p.facts[0], /1 failed/);
  assert.ok(p.failures.some((f) => /leave request/.test(f)));
  const t = summarize("src/a.ts(3,1): error TS2322: Type 'x' is not assignable.\n", 2);
  assert.match(t.facts[0], /tsc: 1 error/);
});

test('formatSummary is short for a pass and lists failures for a fail', () => {
  const pass = formatSummary('npm test', summarize(' Tests  5 passed (5)\n', 0), { seconds: 1.2, logFile: null });
  assert.ok(pass.split('\n').length <= 3);
  const fail = formatSummary('npm test', summarize(' FAIL  src/a.test.js > x\nAssertionError: boom\n', 1), { seconds: 2, logFile: '/tmp/l.log' });
  assert.match(fail, /✘ FAIL/); assert.match(fail, /full log: \/tmp\/l\.log/); assert.match(fail, /boom/);
});
