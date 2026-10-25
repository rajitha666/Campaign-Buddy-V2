#!/usr/bin/env node
// After a UI change: which user-visible labels were REMOVED and are still mentioned in docs/guides/marketing?
// Looks at removed JSX text and capitalised strings in portal/app source, drops anything still present in the
// code at HEAD, then searches the documentation set. Zero AI tokens; heuristic — verify each hit.
//   node scripts/agent/stale-wording.mjs [base head | --merge <sha>] [--cwd dir]
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseRange, gitIn } from './lib/range.mjs';
import { removedLabels, findLabelHits } from './lib/lint.mjs';

const { cwd, spec, head } = parseRange(process.argv.slice(2));
const git = gitIn(cwd);
const diff = git(['diff', '-U0', '--no-color', spec, '--', 'campaign-buddy-portal/src', 'campaign-buddy-app/src']);
let candidates = removedLabels(diff);

// still present in the code at head? then it is not stale
const stillThere = (label) => { try { return git(['grep', '-F', '-l', '--', label, head, '--', 'campaign-buddy-portal/src', 'campaign-buddy-app/src']).trim().length > 0; } catch { return false; } };
candidates = candidates.filter((c) => !stillThere(c.label));
if (!candidates.length) { console.log(`stale-wording ${spec}: no removed UI labels (or all still in the code).`); process.exit(0); }

// documentation set
const docs = [];
const add = (p) => { const f = join(cwd, p); if (existsSync(f) && statSync(f).isFile()) docs.push({ path: p, text: readFileSync(f, 'utf8') }); };
const walk = (dir, re) => { const d = join(cwd, dir); if (!existsSync(d)) return; for (const n of readdirSync(d)) { if (n === 'node_modules' || n === 'assets') continue; const rel = `${dir}/${n}`; const full = join(cwd, rel); if (statSync(full).isDirectory()) walk(rel, re); else if (re.test(n)) add(rel); } };
walk('docs', /\.md$/); walk('marketing', /\.(html|md)$/); ['INSTALLATION_GUIDE.md', 'campaign-buddy-app/README.md', 'AGENTS.md'].forEach(add);

let total = 0; const lines = [];
for (const c of candidates) {
  const hits = [];
  for (const d of docs) for (const h of findLabelHits(c.label, d.text, 2)) hits.push(`${d.path}:${h.line}  ${h.text}`);
  if (hits.length) { total += hits.length; lines.push(`- "${c.label}"  (removed in ${c.file.split('/').slice(-2).join('/')})`); hits.slice(0, 6).forEach((h) => lines.push(`    ${h}`)); if (hits.length > 6) lines.push(`    … +${hits.length - 6} more`); }
}
console.log(`stale-wording ${spec}: ${candidates.length} removed label(s) checked, ${lines.filter((l) => l.startsWith('- ')).length} still mentioned in docs (${total} hit(s)).`);
if (lines.length) console.log(lines.join('\n'));
else console.log('✔ no removed label appears in docs, guides or marketing.');
