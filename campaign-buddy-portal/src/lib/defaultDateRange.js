import { colomboYmd } from './colomboDay';

// Bounded starting date range for report/log pages that would otherwise load
// with an open range (every row ever) the moment they open.
//   'week'     — the last 7 days including today (daily monitoring logs)
//   'campaign' — campaign start .. today (or campaign end, if already over)
// "Today" is the Colombo calendar day, not the UTC one (see colomboDay.js).
const DAY_MS = 86_400_000;

function addDays(ymd, n) {
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function defaultDateRange(kind, campaign, today = colomboYmd()) {
  if (kind === 'week') return { dateFrom: addDays(today, -6), dateTo: today };
  if (kind === 'campaign') {
    const start = campaign?.startDate ? String(campaign.startDate).slice(0, 10) : addDays(today, -30);
    const end = campaign?.endDate ? String(campaign.endDate).slice(0, 10) : today;
    const dateTo = end < today ? end : today;
    const dateFrom = start < dateTo ? start : dateTo; // campaign not started yet: a single day, never an inverted range
    return { dateFrom, dateTo };
  }
  return {};
}
