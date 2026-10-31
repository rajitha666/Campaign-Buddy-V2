import test from 'node:test';
import assert from 'node:assert/strict';
import { lintSql, scanSoftDelete, softDeleteModels, balancedArgs, labelsFrom, removedLabels, findLabelHits, searchClaims } from '../lib/lint.mjs';

// ---------- migration lint ----------
test('lintSql flags destructive and populated-table risks with line numbers', () => {
  const sql = [
    '-- harmless comment with DROP TABLE inside',
    'ALTER TABLE "clients" ADD COLUMN "note" TEXT;',
    'ALTER TABLE "clients" ADD COLUMN "code" TEXT NOT NULL;',
    'ALTER TABLE "clients" ADD COLUMN "ok" TEXT NOT NULL DEFAULT \'x\';',
    'ALTER TABLE "clients" DROP COLUMN "old";',
    'ALTER TABLE "clients" ALTER COLUMN "n" SET NOT NULL;',
    'ALTER TABLE "clients" RENAME COLUMN "a" TO "b";',
    'CREATE UNIQUE INDEX "i" ON "clients"("code");',
    'ALTER TABLE "sales" ADD CONSTRAINT "f" FOREIGN KEY ("c") REFERENCES "clients"("id") ON DELETE CASCADE;',
  ].join('\n');
  const f = lintSql(sql);
  const rules = f.map((x) => `${x.level}:${x.line}`);
  assert.ok(rules.includes('danger:3'), 'NOT NULL without default');
  assert.ok(!rules.includes('danger:4'), 'NOT NULL with default is fine');
  assert.ok(rules.includes('danger:5') && rules.includes('danger:6') && rules.includes('danger:7'));
  assert.ok(rules.includes('warn:8'));
  assert.ok(f.filter((x) => x.line === 9).length >= 2, 'foreign key + cascade');
  assert.ok(!f.some((x) => x.line === 1 || x.line === 2), 'comments and plain nullable ADD COLUMN are clean');
});

test('lintSql is clean for a purely additive migration', () => {
  assert.deepEqual(lintSql('CREATE TABLE "t" ("id" TEXT NOT NULL, CONSTRAINT "t_pkey" PRIMARY KEY ("id"));\nALTER TABLE "x" ADD COLUMN "y" INTEGER;'), []);
});

// ---------- soft-delete lint ----------
test('softDeleteModels reads models carrying deletedAt/archivedAt', () => {
  const schema = 'model Client {\n id String @id\n deletedAt DateTime?\n}\nmodel Plain {\n id String @id\n}\nmodel SalesRecord {\n archivedAt DateTime?\n}\n';
  assert.deepEqual(softDeleteModels(schema), ['client', 'salesRecord']);
});

test('balancedArgs ignores parens inside strings', () => {
  assert.equal(balancedArgs('f({ a: ")(" , b: (1+2) }) tail', 1), '({ a: ")(" , b: (1+2) })');
});

test('scanSoftDelete flags unfiltered reads and accepts filtered / explicitly checked ones', () => {
  const src = [
    'const a = await prisma.client.findMany({ where: { name: "x" } });',                       // 1  flagged
    'const b = await prisma.client.findMany({ where: { deletedAt: null } });',                  // 2  ok
    'const c = await prisma.client.findUnique({ where: { id } });',                             // 3  ok (checked below)
    'if (!c || c.deletedAt) throw notFound();',                                                 // 4
    'const d = await tx.salesRecord.count({ where: { campaignId } });',                         // 5  flagged
    'const e = await prisma.plain.findMany();',                                                 // 6  not soft-deletable
    '', '', '', '', '', '', '', '', '',
    'const f = await prisma.salesRecord.findFirst({ where: { archivedAt: null } });',           // 16 ok
  ].join('\n');
  const f = scanSoftDelete(src, ['client', 'salesRecord']);
  assert.deepEqual(f.map((x) => `${x.line}:${x.model}.${x.method}`), ['1:client.findMany', '5:salesRecord.count']);
});

// ---------- stale wording ----------
test('labelsFrom picks JSX text and capitalised strings, not code-ish tokens', () => {
  const l = labelsFrom("<button onClick={load}>Load sales</button> push('Sales record archived'); const k = 'campaign_id'; <div className=\"nav-item\">");
  assert.ok(l.includes('Load sales') && l.includes('Sales record archived'));
  assert.ok(!l.some((x) => /campaign_id|nav-item/.test(x)));
});

test('removedLabels returns labels removed from UI source and not re-added; ignores tests and non-UI files', () => {
  const diff = [
    '--- a/campaign-buddy-portal/src/components/FilterBar.jsx', '+++ b/campaign-buddy-portal/src/components/FilterBar.jsx', '@@ -1 +1 @@',
    '-      <button onClick={onLoad}>Load</button>', '-      <button onClick={onLoad}>Load sales</button>', '+      <button onClick={onLoad}>Refresh</button>',
    '--- a/campaign-buddy-portal/src/components/X.test.js', '+++ b/campaign-buddy-portal/src/components/X.test.js', '@@ -1 +1 @@', "-  expect('Removed in test').toBe(1)",
    '--- a/docs/api-spec.md', '+++ b/docs/api-spec.md', '@@ -1 +1 @@', '-Press Load sales to continue',
  ].join('\n');
  assert.deepEqual(removedLabels(diff).map((x) => x.label), ['Load', 'Load sales']); // test + doc files are ignored
});

test('findLabelHits strips tags and caps results', () => {
  const doc = 'a\n<p>Press <b>Load sales</b> now</p>\nLoad sales again\nLoad sales third\nLoad sales fourth';
  const h = findLabelHits('Load sales', doc, 3);
  assert.equal(h.length, 3); assert.equal(h[0].text, 'Press Load sales now'); assert.equal(h[0].line, 2);
});

// ---------- claim impact ----------
test('searchClaims ranks multi-keyword lines first and strips markup', () => {
  const docs = [{ path: 'marketing/a.html', text: '<p>GPS tracking while checked in</p>\n<p>Offline sales with GPS tracking and sync</p>\nunrelated line here ok' }];
  const hits = searchClaims(docs, ['gps', 'offline']);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].text, 'Offline sales with GPS tracking and sync');
  assert.equal(searchClaims(docs, ['nothing-here']).length, 0);
});

test('lintSql ignores unique indexes and foreign keys on tables created in the same migration', () => {
  const sql = [
    'CREATE TABLE "t" ("id" TEXT NOT NULL);',
    'CREATE UNIQUE INDEX "t_k" ON "t"("id");',
    'ALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("id") REFERENCES "u"("id");',
    'CREATE UNIQUE INDEX "x_k" ON "existing"("c");',
  ].join('\n');
  assert.deepEqual(lintSql(sql).map((x) => x.line), [4]); // only the index on a pre-existing table
});

test('scanSoftDelete accepts a where-variable filtered just above the call', () => {
  const src = [
    'const where = { deletedAt: null, name: x };',
    'const rows = await prisma.client.findMany({ where, take: 5 });',
    'const bad = await prisma.client.findMany({ where: { name: 1 } });',
  ].join('\n');
  assert.deepEqual(scanSoftDelete(src, ['client']).map((x) => x.line), [3]);
});

test('lintSql does not mistake DROP NOT NULL for a NOT NULL column add', () => {
  const sql = 'ALTER TABLE "t" ADD COLUMN "b" TEXT, ALTER COLUMN "i" DROP NOT NULL;\nALTER TABLE "t" ADD COLUMN "p" DECIMAL(10,2) NOT NULL;';
  const f = lintSql(sql);
  assert.deepEqual(f.map((x) => x.line), [2]); // only the genuine NOT NULL add (no default)
});

test('scanSoftDelete accepts a live*/…Scope spread helper', () => {
  const src = [
    'const c = await prisma.client.findMany({ where: { ...liveClient, id } });',
    'const d = await prisma.client.findMany({ where: { id, ...staffScope(id) } });',
    'const e = await prisma.client.findMany({ where: { id } });', // flagged
  ].join('\n');
  assert.deepEqual(scanSoftDelete(src, ['client']).map((x) => x.line), [3]);
});

test('scanSoftDelete accepts a soft-delete-ok annotation on the line or just above, not further away', () => {
  const src = [
    '// soft-delete-ok: restore reads deleted rows on purpose',
    'const a = await prisma.client.findUnique({ where: { id } });',
    'const b = await prisma.client.findMany({ where: { id } }); // soft-delete-ok: admin export',
    '',
    '',
    '',
    'const c = await prisma.client.findMany({ where: { id } });', // flagged: annotation too far above
  ].join('\n');
  assert.deepEqual(scanSoftDelete(src, ['client']).map((x) => x.line), [7]);
});
