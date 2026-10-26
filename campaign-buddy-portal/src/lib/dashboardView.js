// Presentation helpers for the Overview page. The numbers themselves come from
// GET /campaigns/:id/dashboard; nothing here recomputes them.

// {text, direction} for a "% change vs <label>" line, or null when the server
// had no baseline to compare against (e.g. yesterday was zero).
export function formatDelta(pct, label) {
  if (pct == null) return null;
  if (pct === 0) return { text: `Same as ${label}`, direction: 'flat' };
  return { text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${label}`, direction: pct > 0 ? 'up' : 'down' };
}

// TODO(charter §6): currency should come from a campaign/agency setting; this is the
// page's existing literal, moved here rather than repeated.
export function formatMoney(n) {
  return `LKR ${(n || 0).toLocaleString()}`;
}

export function daysAgoLabel(daysAgo) {
  return daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Fri 23 Oct" from a yyyy-mm-dd calendar date (parsed as UTC so it never drifts).
export function fmtDayShort(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function lastDays(rows, n) {
  return rows.slice(-n);
}
