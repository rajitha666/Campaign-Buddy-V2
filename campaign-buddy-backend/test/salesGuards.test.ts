import { describe, it, expect } from "vitest";
import { workingDaysBetween } from "../src/utils/salesGuards";

describe("workingDaysBetween (#53 — weekends excluded from day counters)", () => {
  it("excludes Saturdays and Sundays from a range spanning several weeks", () => {
    // 2026-09-03 (Thu) to 2026-10-03 (Sat): 31 calendar days, 22 working days.
    const from = new Date("2026-09-03T00:00:00.000Z");
    const to = new Date("2026-10-03T00:00:00.000Z");
    expect(workingDaysBetween(from, to)).toBe(22);
  });

  it("counts a single weekday as 1", () => {
    const d = new Date("2026-09-03T00:00:00.000Z"); // Thursday
    expect(workingDaysBetween(d, d)).toBe(1);
  });

  it("clamps a weekend-only range to 1 rather than 0", () => {
    // 2026-09-05 (Sat) to 2026-09-06 (Sun).
    const from = new Date("2026-09-05T00:00:00.000Z");
    const to = new Date("2026-09-06T00:00:00.000Z");
    expect(workingDaysBetween(from, to)).toBe(1);
  });

  it("returns 0 when the range is inverted", () => {
    const from = new Date("2026-09-10T00:00:00.000Z");
    const to = new Date("2026-09-03T00:00:00.000Z");
    expect(workingDaysBetween(from, to)).toBe(0);
  });
});
