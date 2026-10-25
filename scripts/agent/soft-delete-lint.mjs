#!/usr/bin/env node
// Find backend reads of soft-deletable models (those with deletedAt/archivedAt) that never filter the marker —
// a soft-deleted row would leak into lists, reports or exports. Static, heuristic, zero AI tokens.
//   node scripts/agent/soft-delete-lint.mjs [--root <repo>] [--strict]
// A read is accepted if its arguments mention deletedAt/archivedAt, or an explicit `.deletedAt`/`.archivedAt` check follows within 8 lines.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanSoftDelete, softDeleteModels } from './lib/lint.mjs';

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const root = rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd();
const backend = join(root, 'campaign-buddy-backend');
const schemaPath = join(backend, 'prisma', 'schema.prisma');
if (!existsSync(schemaPath)) { console.error(`No schema at ${schemaPath}`); process.exit(2); }
const models = softDeleteModels(readFileSync(schemaPath, 'utf8'));

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : []; });
const findings = [];
for (const f of walk(join(backend, 'src'))) {
  const rel = relative(root, f).replace(/\\/g, '/');
  for (const x of scanSoftDelete(readFileSync(f, 'utf8'), models)) findings.push({ file: rel, ...x });
}
console.log(`soft-delete-lint: ${models.length} soft-deletable models (${models.join(', ')})`);
if (!findings.length) { console.log('✔ every read of those models filters deletedAt/archivedAt (or checks it explicitly).'); process.exit(0); }
console.log(`✘ ${findings.length} read(s) with no soft-delete filter — verify each (heuristic; nested includes are not checked):`);
for (const x of findings.slice(0, 40)) console.log(`   ${x.file}:${x.line}  ${x.model}.${x.method}(…)`);
if (findings.length > 40) console.log(`   … +${findings.length - 40} more`);
process.exit(argv.includes('--strict') ? 1 : 0);
