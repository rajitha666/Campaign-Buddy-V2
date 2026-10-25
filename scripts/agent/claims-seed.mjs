#!/usr/bin/env node
// Seed / re-sync marketing/CLAIMS.md from the headings of the marketing pages. Keeps any status and evidence already
// recorded; new headings arrive as `unverified`; vanished ones are flagged `retired?`. Zero AI tokens.
//   node scripts/agent/claims-seed.mjs            # show what would change
//   node scripts/agent/claims-seed.mjs --write    # update marketing/CLAIMS.md (creates the file if missing)
//   node scripts/agent/claims-seed.mjs --status   # counts by status only
//   options: --cwd <repo>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { headingRows, parseLedger, mergeLedger, replaceLedger, summarize } from './lib/claims.mjs';

const argv = process.argv.slice(2);
const cwdIdx = argv.indexOf('--cwd');
const cwd = cwdIdx >= 0 ? argv[cwdIdx + 1] : process.cwd();
const ledgerPath = join(cwd, 'marketing', 'CLAIMS.md');

const SOURCES = [
  { prefix: 'brief', file: 'marketing/capability-brief.html', kind: 'html' },
  { prefix: 'landing', file: 'marketing/landing-site/index.html', kind: 'html' },
  { prefix: 'store', file: 'marketing/app-store-listing.md', kind: 'md' },
];
const fresh = [];
for (const s of SOURCES) {
  const p = join(cwd, s.file);
  if (!existsSync(p)) { console.error(`skip (missing): ${s.file}`); continue; }
  fresh.push(...headingRows(s.prefix, s.file, readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), s.kind));
}

const current = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8').replace(/\r\n/g, '\n') : '';
const { rows, added, gone } = mergeLedger(parseLedger(current), fresh);

if (argv.includes('--status')) { console.log(JSON.stringify(summarize(rows))); process.exit(0); }
console.log(`claims-seed: ${fresh.length} sections found, ${rows.length} ledger rows (${added.length} new, ${gone.length} vanished→retired?)  status: ${JSON.stringify(summarize(rows))}`);
if (added.length) console.log(`  new: ${added.slice(0, 8).join(', ')}${added.length > 8 ? ` … +${added.length - 8}` : ''}`);
if (gone.length) console.log(`  vanished: ${gone.join(', ')}`);
if (!argv.includes('--write')) { console.log('  (dry run — pass --write to update marketing/CLAIMS.md)'); process.exit(0); }
if (!current) { console.error('marketing/CLAIMS.md does not exist; create it with the preface first (see docs), then re-run.'); process.exit(2); }
writeFileSync(ledgerPath, replaceLedger(current, rows));
console.log(`  wrote ${ledgerPath}`);
