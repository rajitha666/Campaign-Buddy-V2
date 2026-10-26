import { describe, expect, it } from "vitest";
import { buildAttention, conversionPct, isStaleShift, pctChange, shouldBeCheckedIn, STALE_AFTER_MS } from "../src/utils/dashboardRules";

const at = (iso: string) => new Date(iso);

describe("dashboard rules (#114)", () => {
  it("buildAttention drops zero counts and ranks high severity first, then by count", () => {
    const items = buildAttention({ pending_leave: 5, not_checked_in: 1, outside_geofence: 3, stale_location: 0 });
    expect(items.map((i) => i.type)).toEqual(["not_checked_in", "outside_geofence", "pending_leave"]);
    expect(items[0].label).toBe("1 promoter should be checked in but is not");
    expect(items[1].link).toBe("/staff/attendance");
  });

  it("buildAttention returns an empty list when nothing needs attention", () => {
    expect(buildAttention({})).toEqual([]);
  });

  it("shouldBeCheckedIn only after shift start, and not when checked in or on leave", () => {
    const base = { shiftStart: at("2026-10-26T03:30:00Z"), now: at("2026-10-26T04:00:00Z"), checkedIn: false, onLeave: false };
    expect(shouldBeCheckedIn(base)).toBe(true);
    expect(shouldBeCheckedIn({ ...base, now: at("2026-10-26T03:00:00Z") })).toBe(false);
    expect(shouldBeCheckedIn({ ...base, checkedIn: true })).toBe(false);
    expect(shouldBeCheckedIn({ ...base, onLeave: true })).toBe(false);
  });

  it("isStaleShift uses the newest of last ping and check-in, with a 12 minute threshold", () => {
    const checkInAt = at("2026-10-26T04:00:00Z");
    const now = new Date(checkInAt.getTime() + STALE_AFTER_MS + 1000);
    expect(isStaleShift({ checkInAt, now })).toBe(true);
    expect(isStaleShift({ checkInAt, lastPingAt: new Date(now.getTime() - 60_000), now })).toBe(false);
    expect(isStaleShift({ checkInAt, now: new Date(checkInAt.getTime() + STALE_AFTER_MS) })).toBe(false);
  });

  it("pctChange is null without a baseline and rounds otherwise", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 200)).toBe(-75);
  });

  it("conversionPct is 0 when nobody was approached", () => {
    expect(conversionPct(5, 0)).toBe(0);
    expect(conversionPct(1, 3)).toBe(33);
  });
});
