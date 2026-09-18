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

// Quote a field only when it needs it (comma, quote or newline), doubling quotes.
export function toCsv(lines) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return lines.map((l) => l.map(cell).join(',')).join('\n');
}

export function resultsCsv(rows, origin) {
  const header = ['Date', 'Outlet', 'Promoter', 'Supervisor', 'Category', 'Task', 'Result', 'Photo links', 'Photo uploaded'];
  const lines = rows.map((r) => [
    String(r.date).slice(0, 10),
    r.outletName,
    r.promoterName ?? '',
    r.supervisorName,
    r.category,
    r.task,
    resultText(r),
    (r.photos || []).map((p) => absoluteUrl(p.url, origin)).join(' '),
    (r.photos || []).map((p) => p.uploadedAt).join(' '),
  ]);
  return [header, ...lines];
}
