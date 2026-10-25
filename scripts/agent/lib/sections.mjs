// Heading index + section extraction for big docs (markdown and HTML), so an agent reads one section
// instead of a 10–17k-token file. Pure functions; doc-section.mjs does the file I/O.

export function indexDoc(text, kind) {
  const lines = text.split('\n');
  const out = [];
  if (kind === 'html') {
    lines.forEach((l, i) => {
      const m = l.match(/<h([1-4])\b[^>]*>(.*?)<\/h\1>/i);
      if (m) out.push({ level: Number(m[1]), title: m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&mdash;/g, '—').trim(), line: i + 1 });
    });
  } else {
    let fence = false;
    lines.forEach((l, i) => {
      if (/^```/.test(l)) { fence = !fence; return; }
      if (fence) return;
      const m = l.match(/^(#{1,6})\s+(.*\S)\s*$/);
      if (m) out.push({ level: m[1].length, title: m[2].replace(/[*`]/g, ''), line: i + 1 });
    });
  }
  // end line of each section = line before next heading of same or higher level (or EOF)
  out.forEach((h, i) => {
    let end = lines.length;
    for (let j = i + 1; j < out.length; j++) if (out[j].level <= h.level) { end = out[j].line - 1; break; }
    h.end = end;
  });
  return out;
}

export const kindOf = (file) => (/\.html?$/i.test(file) ? 'html' : 'md');

/** Find sections whose title matches `query` (case-insensitive substring, or a leading number like "5.9"). */
export function findSections(index, query) {
  const q = query.trim().toLowerCase();
  const num = q.match(/^\d+(\.\d+)*$/);
  return index.filter((h) => {
    const t = h.title.toLowerCase();
    if (!num) return t.includes(q);
    // "5. Sales" -> 5, "5.9 Live" -> 5.9: exact, so "5" never matches "5.9"
    const lead = t.match(/^(\d+(?:\.\d+)*)\.?(\s|$)/);
    return !!lead && lead[1] === q;
  });
}

/**
 * Pick the most specific matches. A broad word can appear in the document's own title, which would return the
 * whole file — so prefer headings that start with the query, then drop any match that contains another match.
 */
export function narrowHits(hits, query) {
  const q = query.trim().toLowerCase();
  const starts = hits.filter((h) => h.title.toLowerCase().startsWith(q));
  const pool = starts.length ? starts : hits;
  return pool.filter((h) => !pool.some((o) => o !== h && h.line <= o.line && h.end >= o.end));
}

export function approxTokens(lines) { return Math.round(lines.join('\n').length / 4); }

/** Slice a section's text, capped at `maxLines` with a visible truncation notice. */
export function sliceSection(text, h, maxLines = 120) {
  const lines = text.split('\n').slice(h.line - 1, h.end);
  if (lines.length <= maxLines) return { text: lines.join('\n'), truncated: false, total: lines.length };
  return { text: lines.slice(0, maxLines).join('\n') + `\n… [truncated: ${lines.length - maxLines} more lines — rerun with --max ${lines.length}]`, truncated: true, total: lines.length };
}
