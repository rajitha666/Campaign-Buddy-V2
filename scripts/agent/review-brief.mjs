#!/usr/bin/env node
// Compact "review brief" for reviewer agents (and CI): which reviewers a change needs, size by package,
// and mechanical red flags — so agents judge instead of reading whole diffs. Zero AI tokens.
//
//   node scripts/agent/review-brief.mjs                      # main...HEAD
//   node scripts/agent/review-brief.mjs <base> <head>        # git diff base...head
//   node scripts/agent/review-brief.mjs --merge <sha>        # an already-merged PR (sha^1..sha)
//   options: --major  --mode full|light|off  --json  --cwd <repo or worktree>
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { classifyPath, profileFiles, parseAdded, scanAdded, coverageFlags } from './lib/profile.mjs';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const has = (name) => argv.includes(name);
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--merge', '--mode', '--cwd'].includes(argv[i - 1]));
const cwd = opt('--cwd') || process.cwd();

const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

let range;
if (opt('--merge')) range = [`${opt('--merge')}^1`, opt('--merge'), '..'];
else range = [positional[0] || 'main', positional[1] || 'HEAD', '...'];
const spec = `${range[0]}${range[2]}${range[1]}`;

function readMode() {
  const forced = opt('--mode');
  if (forced) return forced;
  try { return JSON.parse(readFileSync(join(homedir(), '.campaign-buddy', 'team-mode.json'), 'utf8')).mode || 'full'; } catch { return 'full'; }
}
const mode = readMode();

const numstat = git(['diff', '--numstat', spec]).trim().split('\n').filter(Boolean).map((l) => {
  const [a, d, ...rest] = l.split('\t'); return { path: rest.join('\t').replace(/.*=> /, '').replace(/[{}]/g, ''), add: a === '-' ? 0 : Number(a), del: d === '-' ? 0 : Number(d) };
});
if (!numstat.length) { console.log(`# Review brief ${spec}\n\nNo changes in this range.`); process.exit(0); }

const files = numstat.map((n) => n.path);
const profile = profileFiles(files, { major: has('--major'), mode });
const added = parseAdded(git(['diff', '-U0', '--no-color', spec]));

// Prisma models that carry a soft-delete marker (best effort, from the working copy).
let softDeleteModels = [];
const schemaPath = join(cwd, 'campaign-buddy-backend', 'prisma', 'schema.prisma');
if (existsSync(schemaPath)) {
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g; const s = readFileSync(schemaPath, 'utf8'); let m;
  while ((m = re.exec(s))) if (/\b(deletedAt|archivedAt)\b/.test(m[2])) softDeleteModels.push(m[1][0].toLowerCase() + m[1].slice(1));
}
const flags = scanAdded(added, { softDeleteModels });
const cov = coverageFlags(profile.infos, { routesTouched: flags.routes.length > 0 });

if (has('--json')) { console.log(JSON.stringify({ spec, mode, profile: { ...profile, infos: undefined }, flags, cov, files: numstat }, null, 2)); process.exit(0); }

const byArea = {};
for (const n of numstat) { const a = classifyPath(n.path).area; (byArea[a] ||= { files: 0, add: 0, del: 0 }); byArea[a].files++; byArea[a].add += n.add; byArea[a].del += n.del; }
const total = numstat.reduce((t, n) => ({ add: t.add + n.add, del: t.del + n.del }), { add: 0, del: 0 });
const cap = (arr, n = 8) => (arr.length > n ? [...arr.slice(0, n), `… +${arr.length - n} more`] : arr);
const lines = [];
lines.push(`# Review brief — ${spec}`);
lines.push(`Mode: ${mode}${profile.major ? ' · MAJOR' : ''} | ${numstat.length} files, +${total.add}/-${total.del}`);
lines.push(`Needs (${profile.reasons.join(', ') || 'n/a'}): Product Owner (intake+final)${profile.reviewers.length ? ' · ' + profile.reviewers.join(' · ') : ''}`);
if (profile.note) lines.push(`> ${profile.note}`);
lines.push('', '## By package');
for (const [a, v] of Object.entries(byArea).sort((x, y) => y[1].add + y[1].del - (x[1].add + x[1].del))) lines.push(`- ${a}: ${v.files} files +${v.add}/-${v.del}`);
lines.push('', '## Biggest changes (read these, by hunk — not the whole diff)');
for (const n of [...numstat].filter((n) => !classifyPath(n.path).isTest).sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 12)) lines.push(`- ${n.path}  +${n.add}/-${n.del}`);
const tests = numstat.filter((n) => classifyPath(n.path).isTest);
lines.push('', `## Tests touched: ${tests.length ? tests.map((t) => t.path.split('/').slice(-2).join('/')).slice(0, 8).join(', ') : 'none'}`);
lines.push('', '## Red flags (mechanical; verify before reporting)');
const F = [
  ['New locale literal (LKR / Asia/Colombo / +94) — charter G5', flags.locale],
  ['Raw colour literal outside tokens', flags.colors],
  ['Raw font-size px outside tokens', flags.fontPx],
  ['Native confirm/alert', flags.nativeDialogs],
  ['Backend route lines added (API contract — check shipped-client compat, docs, MCP coverage)', flags.routes],
  ['Risky migration SQL (DROP / SET NOT NULL / RENAME)', flags.migrationRisk],
  ['Read of a soft-deletable model without a deletedAt/archivedAt filter (heuristic)', flags.softDelete],
];
let any = false;
const noisy = new Set(['Raw colour literal outside tokens', 'Raw font-size px outside tokens']); // portal has no type/colour tokens yet (story #118)
for (const [label, arr] of F) if (arr.length) { any = true; lines.push(`- ${label} (${arr.length}):`); cap(arr, noisy.has(label) ? 3 : 8).forEach((x) => lines.push(`    ${x}`)); }
for (const c of cov) { any = true; lines.push(`- ${c}`); }
if (!any) lines.push('- none found');
lines.push('', '_Generated by scripts/agent/review-brief.mjs — heuristics, not verdicts._');
console.log(lines.join('\n'));
