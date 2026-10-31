#!/usr/bin/env node
// Read one section of a big doc instead of the whole file.
//   node scripts/agent/doc-section.mjs <file>                 # heading index with line ranges and ~tokens
//   node scripts/agent/doc-section.mjs <file> "<query>"       # the section(s) whose heading matches (text or number like 5.9)
//   options: --max <lines> (default 120)   --first (only the first match)
import { readFileSync } from 'node:fs';
import { indexDoc, kindOf, findSections, narrowHits, sliceSection, approxTokens } from './lib/sections.mjs';

const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 120;
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--max');
const [file, query] = pos;
if (!file) { console.error('usage: doc-section.mjs <file> ["<heading text or number>"] [--max N] [--first]'); process.exit(2); }

const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const idx = indexDoc(text, kindOf(file));

if (!query) {
  const lines = text.split('\n');
  console.log(`${file}: ${lines.length} lines, ~${approxTokens(lines)} tokens. Sections (line range, ~tokens):`);
  for (const h of idx) console.log(`${'  '.repeat(h.level - 1)}- ${h.title}  [${h.line}-${h.end}, ~${approxTokens(lines.slice(h.line - 1, h.end))}t]`);
  process.exit(0);
}
let hits = findSections(idx, query);
if (!hits.length) { console.error(`No heading matches "${query}". Run without a query to list headings.`); process.exit(1); }
if (args.includes('--first')) hits = hits.slice(0, 1);
hits = narrowHits(hits, query);
for (const h of hits) {
  const s = sliceSection(text, h, max);
  console.log(`### ${file}:${h.line}-${h.end} — ${h.title}${s.truncated ? ' (truncated)' : ''}\n${s.text}\n`);
}
