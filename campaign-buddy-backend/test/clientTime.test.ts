import { describe, expect, it } from "vitest";
import { resolveCapturedAt } from "../src/utils/clientTime";

const NOW = new Date("2026-09-18T10:00:00.000Z");

describe("resolveCapturedAt — trusting an offline-captured time", () => {
  it("uses server time when the client sent nothing", () => {
    expect(resolveCapturedAt(undefined, NOW)).toEqual(NOW);
  });

  it("uses an earlier time from the same Colombo day (a queued offline action)", () => {
    expect(resolveCapturedAt("2026-09-18T04:31:00.000Z", NOW)).toEqual(new Date("2026-09-18T04:31:00.000Z"));
  });

  it("ignores garbage", () => {
    expect(resolveCapturedAt("not-a-date", NOW)).toEqual(NOW);
  });

  it("ignores a time in the future beyond clock-skew tolerance", () => {
    expect(resolveCapturedAt("2026-09-18T11:00:00.000Z", NOW)).toEqual(NOW);
  });

  it("clamps a tiny future skew to now rather than storing a future time", () => {
    expect(resolveCapturedAt("2026-09-18T10:01:00.000Z", NOW)).toEqual(NOW);
  });

  it("ignores a time from a different Colombo day (never re-dates a record)", () => {
    // 23:30 Colombo on the 17th — the day before NOW's Colombo day (the 18th).
    expect(resolveCapturedAt("2026-09-17T18:00:00.000Z", NOW)).toEqual(NOW);
  });

  it("trusts a time on the same Colombo day even when the UTC date differs", () => {
    // 06:41 Colombo on the 20th; 03:20 Colombo the same day is still the 19th in UTC.
    const now = new Date("2026-09-20T01:11:00.000Z");
    expect(resolveCapturedAt("2026-09-19T21:50:00.000Z", now)).toEqual(new Date("2026-09-19T21:50:00.000Z"));
  });
});
