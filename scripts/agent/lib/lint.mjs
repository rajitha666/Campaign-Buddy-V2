// Pure logic for the second-pass toolkit: migration safety lint, soft-delete read lint, removed-label extraction
// (stale wording in docs) and keyword search over marketing text. No I/O — the CLIs read git/files.

// ---------------------------------------------------------------- migration lint
/** Lint Prisma/SQL migration text. Returns [{level:'danger'|'warn', rule, line, text}]. */
export function lintSql(sql) {
  // blank out -- comments but keep line count, then split into statements with their start lines
  const clean = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const out = [];
  // tables created in this same migration are empty, so unique-index / foreign-key checks on them cannot fail
  const created = new Set([...clean.matchAll(/CREATE\s+TABLE\s+"?(\w+)"?/gi)].map((m) => m[1].toLowerCase()));
  let line = 1; let start = 1; let buf = '';
  for (const ch of clean) {
    if (ch === '\n') line += 1;
    if (ch === ';') { check(buf, start, out, created); buf = ''; start = line; continue; }
    if (!buf.trim() && ch.trim()) start = line;
    buf += ch;
  }
  check(buf, start, out, created);
  return out;
}

function check(stmt, line, out, created) {
  const s = stmt.replace(/\s+/g, ' ').trim();
  if (!s) return;
  const target = (s.match(/\bON\s+"?(\w+)"?\s*\(/i) || s.match(/ALTER\s+TABLE\s+"?(\w+)"?/i) || [])[1];
  const onNewTable = !!target && created.has(target.toLowerCase());
  const add = (level, rule) => out.push({ level, rule, line, text: s.slice(0, 110) });
  if (/\bDROP\s+TABLE\b/i.test(s)) add('danger', 'DROP TABLE — destroys data and breaks old clients still reading it');
  if (/\bDROP\s+COLUMN\b/i.test(s)) add('danger', 'DROP COLUMN — destroys data; shipped apps/queued payloads may still send it');
  if (/\bTRUNCATE\b/i.test(s)) add('danger', 'TRUNCATE — deletes all rows');
  if (/^DELETE\s+FROM\b/i.test(s)) add('danger', 'DELETE FROM in a migration — verify it cannot remove field data');
  if (/\bSET\s+NOT\s+NULL\b/i.test(s)) add('danger', 'SET NOT NULL — fails if any existing row is null');
  if (/\bRENAME\b/i.test(s)) add('danger', 'RENAME — breaks readers of the old name (no expand/contract)');
  if (/\bALTER\s+COLUMN\b.*\bTYPE\b/i.test(s)) add('danger', 'ALTER COLUMN TYPE — rewrite/cast risk on populated tables');
  // each ADD COLUMN clause on its own (commas inside DECIMAL(10,2) removed first; "DROP NOT NULL" is a different clause)
  const flat = s.replace(/\(([^)]*)\)/g, (m) => m.replace(/,/g, ''));
  for (const clause of flat.match(/ADD\s+COLUMN\s+"?\w+"?[^,]*/gi) || []) {
    if (/\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause)) { add('danger', 'ADD COLUMN … NOT NULL without DEFAULT — fails on a populated table'); break; }
  }
  if (/\bDROP\s+TYPE\b/i.test(s)) add('danger', 'DROP TYPE — destroys an enum other code may use');
  if (/\bCREATE\s+UNIQUE\s+INDEX\b/i.test(s) && !onNewTable) add('warn', 'UNIQUE INDEX — fails if existing rows already hold duplicates');
  if (/\bADD\s+CONSTRAINT\b.*\bFOREIGN\s+KEY\b/i.test(s) && !onNewTable) add('warn', 'FOREIGN KEY — fails if orphaned rows exist; check ON DELETE behaviour (cascades can delete history)');
  if (/\bON\s+DELETE\s+CASCADE\b/i.test(s)) add('warn', 'ON DELETE CASCADE — deleting a parent deletes children (sales, attendance?) — confirm intent');
  if (/\bDROP\s+(INDEX|CONSTRAINT)\b/i.test(s)) add('warn', 'DROP INDEX/CONSTRAINT — check query performance / integrity impact');
}

// ---------------------------------------------------------------- soft-delete read lint
const READS = 'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy';

/** Text of the balanced (...) argument block starting at index of '('; ignores parens inside quotes. */
export function balancedArgs(text, openIdx) {
  let depth = 0; let q = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx);
}

/** Reads of soft-deletable models whose call (or the next lines) never mention deletedAt/archivedAt. */
export function scanSoftDelete(text, models) {
  const set = new Set(models);
  const re = new RegExp(`\\b(?:prisma|tx|client|db)\\.(\\w+)\\.(${READS})\\(`, 'g');
  const lines = text.split('\n');
  const findings = []; let m;
  while ((m = re.exec(text))) {
    if (!set.has(m[1])) continue;
    const open = m.index + m[0].length - 1;
    const args = balancedArgs(text, open);
    const lineNo = text.slice(0, m.index).split('\n').length;
    // Accept an explicit check only on the variable THIS read assigned (`const x = await prisma…` … `x.deletedAt`),
    // not on some unrelated variable nearby.
    const assigned = text.slice(Math.max(0, m.index - 80), m.index).match(/(?:const|let|var)\s+(\w+)\s*=\s*await\s*$/);
    const after = lines.slice(lineNo - 1, lineNo + 8).join('\n');
    const checked = assigned && new RegExp(`\\b${assigned[1]}\\??\\.(deletedAt|archivedAt)\\b`).test(after);
    // a filter built into a `where` variable just above: `const where = { deletedAt: null, … }` then `findMany({ where })`
    const before = lines.slice(Math.max(0, lineNo - 13), lineNo - 1).join('\n');
    const viaVariable = /\bwhere\b/.test(args) && !/where\s*:\s*\{/.test(args) && /(deletedAt|archivedAt)\s*:/.test(before);
    // an explicit, reasoned opt-out (`// soft-delete-ok: why`) on the call's line or the two above it, or a spread of a
    // `live…` / `…Scope(...)` helper (which by convention bakes the filter in)
    const nearby = lines.slice(Math.max(0, lineNo - 3), lineNo).join('\n');
    const annotated = /soft-delete-ok/.test(nearby);
    const viaHelper = /\.\.\.\s*(?:live[A-Z]\w*|\w+Scope)/.test(args);
    if (/deletedAt|archivedAt/.test(args) || checked || viaVariable || annotated || viaHelper) continue;
    findings.push({ line: lineNo, model: m[1], method: m[2] });
  }
  return findings;
}

/** Prisma models (camelCase) carrying a soft-delete marker, from schema.prisma text. */
export function softDeleteModels(schema) {
  const out = []; const re = /model\s+(\w+)\s*\{([^}]*)\}/g; let m;
  while ((m = re.exec(schema))) if (/\b(deletedAt|archivedAt)\b/.test(m[2])) out.push(m[1][0].toLowerCase() + m[1].slice(1));
  return out;
}

// ---------------------------------------------------------------- stale wording
const looksLikeCode = (s) => /[/_=<>{}\\]|=>|\.(js|jsx|ts|tsx|css|json)\b|--|::/.test(s) || /^[a-z][A-Za-z0-9]*$/.test(s) || /^[A-Z_]+$/.test(s);

/** Labels user-visible in removed lines: JSX text and capitalised quoted strings. */
export function labelsFrom(line) {
  const found = new Set(); let m;
  const jsx = />\s*([A-Za-z][^<>{}\n]{2,50}?)\s*</g;
  while ((m = jsx.exec(line))) found.add(m[1].trim());
  const q = /(['"`])([A-Z][A-Za-z0-9 ,.'&-]{3,60})\1/g;
  while ((m = q.exec(line))) found.add(m[2].trim());
  return [...found].filter((s) => s.length >= 4 && /[a-z]/.test(s) && !looksLikeCode(s));
}

/** From a unified diff, labels that were removed and not re-added. Only portal/app UI source files are considered. */
export function removedLabels(diff) {
  const removed = new Map(); const added = new Set();
  let file = null;
  for (const raw of diff.split('\n')) {
    const f = raw.match(/^\+\+\+ b\/(.*)$/); if (f) { file = f[1]; continue; }
    const g = raw.match(/^--- a\/(.*)$/); if (g) { file = g[1]; continue; }
    if (!file || !/^(campaign-buddy-portal|campaign-buddy-app)\/src\/.*\.(jsx|tsx|js|ts)$/.test(file) || /\.test\./.test(file)) continue;
    if (raw.startsWith('-') && !raw.startsWith('---')) labelsFrom(raw.slice(1)).forEach((l) => { if (!removed.has(l)) removed.set(l, file); });
    else if (raw.startsWith('+') && !raw.startsWith('+++')) labelsFrom(raw.slice(1)).forEach((l) => added.add(l));
  }
  return [...removed].filter(([l]) => !added.has(l)).map(([label, file]) => ({ label, file }));
}

/** Lines of `text` containing `label` (case-sensitive), as [{line, text}], capped. */
export function findLabelHits(label, text, cap = 3) {
  const out = [];
  text.split('\n').forEach((l, i) => { if (out.length < cap && l.includes(label)) out.push({ line: i + 1, text: l.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140) }); });
  return out;
}

// ---------------------------------------------------------------- claim impact
/** Lines mentioning any keyword, best match first. `docs` = [{path, text}]. */
export function searchClaims(docs, keywords, cap = 20) {
  const kws = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const hits = [];
  for (const d of docs) {
    d.text.split('\n').forEach((raw, i) => {
      const plain = raw.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/\s+/g, ' ').trim();
      if (plain.length < 12) return;
      const low = plain.toLowerCase();
      const score = kws.filter((k) => low.includes(k)).length;
      if (score) hits.push({ path: d.path, line: i + 1, score, text: plain.slice(0, 170) });
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line).slice(0, cap);
}
