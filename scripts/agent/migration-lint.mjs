#!/usr/bin/env node
// Lint Prisma/SQL migrations touched by a change for data-loss and populated-table risks. Zero AI tokens.
//   node scripts/agent/migration-lint.mjs                  # migrations changed in main...HEAD
//   node scripts/agent/migration-lint.mjs --merge <sha>    # an already-merged PR
//   node scripts/agent/migration-lint.mjs --all            # every migration (audit)
//   exit code 1 if any 'danger' finding (use --warn-only to always exit 0)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseRange, gitIn } from './lib/range.mjs';
import { lintSql } from './lib/lint.mjs';

const argv = process.argv.slice(2);
const { cwd, spec, head } = parseRange(argv);
const git = gitIn(cwd);
const files = [];
if (argv.includes('--all')) {
  const dir = join(cwd, 'campaign-buddy-backend', 'prisma', 'migrations');
  for (const d of readdirSync(dir)) { const f = join(dir, d, 'migration.sql'); try { if (statSync(f).isFile()) files.push({ path: `campaign-buddy-backend/prisma/migrations/${d}/migration.sql`, text: readFileSync(f, 'utf8') }); } catch { /* not a migration dir */ } }
} else {
  const changed = git(['diff', '--name-only', '--diff-filter=AM', spec]).split('\n').filter((p) => /prisma\/migrations\/.*\.sql$/.test(p));
  for (const p of changed) files.push({ path: p, text: git(['show', `${head}:${p}`]) });
}
if (!files.length) { console.log(`migration-lint: no migrations ${argv.includes('--all') ? 'found' : `changed in ${spec}`}.`); process.exit(0); }

let danger = 0; let warn = 0; const lines = [];
for (const f of files) {
  const found = lintSql(f.text);
  if (!found.length) { lines.push(`✔ ${f.path.split('/').slice(-2).join('/')}`); continue; }
  lines.push(`✘ ${f.path}`);
  for (const x of found) { x.level === 'danger' ? danger++ : warn++; lines.push(`   ${x.level === 'danger' ? 'DANGER' : 'warn  '} line ${x.line}: ${x.rule}\n          ${x.text}`); }
}
console.log(`migration-lint ${argv.includes('--all') ? '(all)' : spec}: ${files.length} migration(s), ${danger} danger, ${warn} warn\n` + lines.join('\n'));
process.exit(danger && !argv.includes('--warn-only') ? 1 : 0);
