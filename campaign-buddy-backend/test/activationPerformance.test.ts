import { describe, it, expect } from "vitest";
import { countActivationWorkingDays, workingDaysPerMonth } from "../src/utils/activationPerformance";

describe("countActivationWorkingDays (client doc B — activation-type-aware day counting)", () => {
  // 2026-09-03 (Thu) to 2026-10-03 (Sat): 31 calendar days, 22 weekdays, 9 weekend days.
  const from = new Date("2026-09-03T00:00:00.000Z");
  const to = new Date("2026-10-03T00:00:00.000Z");

  it("counts Mon-Fri for a monthly activation", () => {
    expect(countActivationWorkingDays(from, to, "monthly")).toBe(22);
  });

  it("counts Sat/Sun for a weekend activation", () => {
    expect(countActivationWorkingDays(from, to, "weekend")).toBe(9);
  });

  it("returns 0 (not clamped) for a weekday-only range on a weekend activation", () => {
    const mon = new Date("2026-09-07T00:00:00.000Z"); // Monday
    const fri = new Date("2026-09-11T00:00:00.000Z"); // Friday
    expect(countActivationWorkingDays(mon, fri, "weekend")).toBe(0);
  });

  it("returns 0 when the range is inverted", () => {
    expect(countActivationWorkingDays(to, from, "monthly")).toBe(0);
  });
});

describe("workingDaysPerMonth", () => {
  it("is 8 for weekend, 25 for monthly", () => {
    expect(workingDaysPerMonth("weekend")).toBe(8);
    expect(workingDaysPerMonth("monthly")).toBe(25);
  });
});
