// Helpers for the Supervisor Task Results page (mobile outlet checklist answers).

export function resultText(r) {
  if (r.taskType === 'photo') {
    const n = r.photos?.length || 0;
    return `${n} photo${n === 1 ? '' : 's'}`;
  }
  if (r.rating != null) return `${r.rating} / 5`;
  return r.feedback || '';
}

// Average out of 5 with one decimal, or a dash when nothing was rated.
export function scoreLabel(avg) {
  return avg == null ? '—' : `${avg.toFixed(1)} / 5`;
}

// /uploads paths are relative to the API origin; an exported file has no origin.
export function absoluteUrl(url, origin) {
  return /^https?:\/\//i.test(url) ? url : `${origin}${url}`;
}

export { toCsv } from './csv';

// Split answer rows into per-outlet blocks for the grouped results table,
// keeping each outlet's rows in server order (date). A dash covers rows
// whose outlet is missing (shouldn't normally happen).
export function groupByOutlet(rows) {
  const groups = [];
  const byName = new Map();
  for (const r of rows) {
    const name = r.outletName || '—';
    if (!byName.has(name)) {
      const g = { outletName: name, rows: [] };
      byName.set(name, g);
      groups.push(g);
    }
    byName.get(name).rows.push(r);
  }
  return groups;
}

// Export-friendly timestamps: date-only for the visit day, `YYYY-MM-DD HH:MM`
// for photo upload times so Excel doesn't show raw ISO strings.
export function exportDate(d) {
  return String(d).slice(0, 10);
}

export function exportDateTime(d) {
  return String(d).slice(0, 16).replace('T', ' ');
}

// A supervisor can visit an outlet several times in a day; each check-in is its own visit
// with its own checklist. "Visit 2 · 3:35 PM" (time = when that visit began, if known).
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export function visitLabel(r, fmt = clock) {
  const label = `Visit ${r.visitNo ?? 1}`;
  return r.visitStartedAt ? `${label} · ${fmt(r.visitStartedAt)}` : label;
}

export function resultsCsv(rows, origin) {
  const header = ['Date', 'Visit', 'Outlet', 'Promoter', 'Supervisor', 'Category', 'Task', 'Result', 'Photo links', 'Photo uploaded'];
  const lines = rows.map((r) => [
    exportDate(r.date),
    r.visitNo ?? 1,
    r.outletName,
    r.promoterName ?? '',
    r.supervisorName,
    r.category,
    r.task,
    resultText(r),
    (r.photos || []).map((p) => absoluteUrl(p.url, origin)).join(' '),
    (r.photos || []).map((p) => exportDateTime(p.uploadedAt)).join(' '),
  ]);
  return [header, ...lines];
}
