#!/usr/bin/env node
// Which marketing claims mention these keywords? Searches marketing/CLAIMS.md first (when it exists), then the
// capability brief, landing site, deck source, store listing and marketing README. Zero AI tokens.
//   node scripts/agent/claim-impact.mjs <keyword> [<keyword> ...] [--max 20] [--cwd dir]
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { searchClaims } from './lib/lint.mjs';

const argv = process.argv.slice(2);
const maxIdx = argv.indexOf('--max'); const cwdIdx = argv.indexOf('--cwd');
const cap = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 20;
const cwd = cwdIdx >= 0 ? argv[cwdIdx + 1] : process.cwd();
const keywords = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--max' && argv[i - 1] !== '--cwd');
if (!keywords.length) { console.error('usage: claim-impact.mjs <keyword> [<keyword> ...] [--max N]'); process.exit(2); }

const docs = [];
const add = (p) => { const f = join(cwd, p); if (existsSync(f) && statSync(f).isFile()) docs.push({ path: p, text: readFileSync(f, 'utf8') }); };
const walk = (dir, re, skip = []) => { const d = join(cwd, dir); if (!existsSync(d)) return; for (const n of readdirSync(d)) { if (n === 'node_modules' || skip.includes(n)) continue; const rel = `${dir}/${n}`; if (statSync(join(cwd, rel)).isDirectory()) walk(rel, re, skip); else if (re.test(n)) add(rel); } };
const hasLedger = existsSync(join(cwd, 'marketing', 'CLAIMS.md'));
add('marketing/CLAIMS.md'); add('marketing/capability-brief.html'); add('marketing/README.md'); add('marketing/app-store-listing.md');
walk('marketing/landing-site', /\.(html|md)$/); walk('marketing/deck', /\.(jsx?|html|md)$/, ['dist', 'out']);

const hits = searchClaims(docs, keywords, cap);
console.log(`claim-impact [${keywords.join(', ')}]: ${hits.length} line(s)${hasLedger ? '' : '  — NOTE: marketing/CLAIMS.md (the claims ledger) does not exist yet, so these are raw mentions'}`);
for (const h of hits) console.log(`  ${h.path}:${h.line}  ${h.text}`);
if (!hits.length) console.log('  no marketing text mentions these keywords.');
