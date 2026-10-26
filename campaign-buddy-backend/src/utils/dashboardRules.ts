// Pure rules behind GET /campaigns/:campaignId/dashboard (issue #114). No DB
// access here so each rule is unit-testable; the route feeds them rows.

// A position older than this is "stale" — same threshold as the portal's
// Live Locations "Last seen" (PR #104).
export const STALE_AFTER_MS = 12 * 60_000;

export type AttentionType =
  | "not_checked_in"
  | "outside_geofence"
  | "stale_location"
  | "no_sales_update"
  | "pending_leave"
  | "open_previous_shift";

export interface AttentionItem {
  type: AttentionType;
  severity: "high" | "medium" | "low";
  count: number;
  label: string;
  // Portal route that fixes it.
  link: string;
}

// Lower rank = shown first.
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

const ATTENTION_META: Record<AttentionType, { severity: AttentionItem["severity"]; link: string; one: string; many: string }> = {
  not_checked_in: { severity: "high", link: "/staff/absence", one: "promoter should be checked in but is not", many: "promoters should be checked in but are not" },
  stale_location: { severity: "high", link: "/tracking/live", one: "staff member has not sent a location in 12+ minutes", many: "staff have not sent a location in 12+ minutes" },
  outside_geofence: { severity: "medium", link: "/staff/attendance", one: "check-in outside the outlet geofence today", many: "check-ins outside the outlet geofence today" },
  no_sales_update: { severity: "medium", link: "/sales/status", one: "outlet with a check-in but no sales update today", many: "outlets with a check-in but no sales update today" },
  open_previous_shift: { severity: "medium", link: "/staff/attendance", one: "shift from a previous day is still open", many: "shifts from previous days are still open" },
  pending_leave: { severity: "low", link: "/leave-requests", one: "leave request waiting for a decision", many: "leave requests waiting for a decision" },
};

// Builds the ranked "Needs attention" list: zero-count signals are dropped,
// the rest sorted high -> low severity, then by count (largest first).
export function buildAttention(counts: Partial<Record<AttentionType, number>>): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const type of Object.keys(ATTENTION_META) as AttentionType[]) {
    const count = counts[type] ?? 0;
    if (count <= 0) continue;
    const meta = ATTENTION_META[type];
    items.push({ type, severity: meta.severity, count, label: `${count} ${count === 1 ? meta.one : meta.many}`, link: meta.link });
  }
  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
}

// Staff absence rule (the `/absence` report): expected by now = their shift
// start has passed, they have no check-in and are not on approved leave.
export function shouldBeCheckedIn(args: { shiftStart: Date; now: Date; checkedIn: boolean; onLeave: boolean }): boolean {
  return !args.checkedIn && !args.onLeave && args.now.getTime() >= args.shiftStart.getTime();
}

// An open shift is stale when its newest sign of life (last ping, else the
// check-in itself) is older than STALE_AFTER_MS.
export function isStaleShift(args: { checkInAt: Date; lastPingAt?: Date | null; now: Date }): boolean {
  const lastSeen = args.lastPingAt && args.lastPingAt > args.checkInAt ? args.lastPingAt : args.checkInAt;
  return args.now.getTime() - lastSeen.getTime() > STALE_AFTER_MS;
}

// Percentage change vs a baseline, rounded to a whole percent. null when there
// is no baseline (0 -> anything has no meaningful ratio).
export function pctChange(current: number, baseline: number): number | null {
  if (!baseline) return null;
  return Math.round(((current - baseline) / baseline) * 100);
}

// Conversion = converted / approached, as a whole percent; 0 when nobody was approached.
export function conversionPct(converted: number, approached: number): number {
  return approached > 0 ? Math.round((converted / approached) * 100) : 0;
}
