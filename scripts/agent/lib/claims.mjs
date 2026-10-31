// Claims-ledger helpers: seed ledger rows from marketing page headings and merge them into marketing/CLAIMS.md
// without losing the status/evidence a human or the marketing writer already recorded. Pure; claims-seed.mjs does I/O.
import { indexDoc } from './sections.mjs';

export const START = '<!-- ledger:start -->';
export const END = '<!-- ledger:end -->';
export const STATUSES = ['verified', 'unverified', 'contradicted', 'retired?'];
const HEAD = '| ID | Topic (section heading) | Where | Status | Evidence (feature · doc · test) | Last checked |';
const RULE = '|---|---|---|---|---|---|';

const slug = (s) => s.toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

/** Rows for the h2/h3 sections of one marketing file. `prefix` becomes the id namespace ("brief", "landing", "store"). */
export function headingRows(prefix, file, text, kind) {
  const idx = indexDoc(text, kind).filter((h) => h.level >= 2 && h.level <= 3 && h.title.length > 3);
  const seen = new Map();
  return idx.map((h) => {
    let id = `${prefix}:${slug(h.title)}`;
    const n = (seen.get(id) || 0) + 1; seen.set(id, n); if (n > 1) id += `-${n}`;
    return { id, topic: h.title, where: `${file}:${h.line}-${h.end}`, status: 'unverified', evidence: '', checked: '' };
  });
}

/** Parse the ledger table between START/END into rows (order kept). */
export function parseLedger(md) {
  const a = md.indexOf(START); const b = md.indexOf(END);
  if (a < 0 || b < 0) return [];
  return md.slice(a + START.length, b).split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && !/^\|\s*(ID|-+)/.test(l)).map((l) => {
    const c = l.replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    return { id: c[0], topic: c[1] || '', where: c[2] || '', status: c[3] || 'unverified', evidence: c[4] || '', checked: c[5] || '' };
  });
}

/** Keep human-recorded status/evidence for known ids; add new headings as unverified; flag vanished ones `retired?`. */
export function mergeLedger(existing, fresh) {
  const old = new Map(existing.map((r) => [r.id, r]));
  const freshIds = new Set(fresh.map((r) => r.id));
  const out = fresh.map((f) => { const o = old.get(f.id); return o ? { ...o, topic: f.topic, where: f.where } : f; });
  for (const o of existing) if (!freshIds.has(o.id)) out.push({ ...o, status: o.status === 'retired?' ? o.status : 'retired?' });
  const added = fresh.filter((f) => !old.has(f.id)).map((f) => f.id);
  const gone = existing.filter((o) => !freshIds.has(o.id)).map((o) => o.id);
  return { rows: out, added, gone };
}

export function renderLedger(rows) {
  return [START, HEAD, RULE, ...rows.map((r) => `| ${cell(r.id)} | ${cell(r.topic)} | ${cell(r.where)} | ${cell(r.status)} | ${cell(r.evidence)} | ${cell(r.checked)} |`), END].join('\n');
}

/** Rewrite only the ledger block of an existing CLAIMS.md (everything outside the markers is kept). */
export function replaceLedger(md, rows) {
  const block = renderLedger(rows);
  const a = md.indexOf(START); const b = md.indexOf(END);
  if (a < 0 || b < 0) return `${md.trimEnd()}\n\n${block}\n`;
  return md.slice(0, a) + block + md.slice(b + END.length);
}

export function summarize(rows) {
  const by = {}; rows.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
  return by;
}
