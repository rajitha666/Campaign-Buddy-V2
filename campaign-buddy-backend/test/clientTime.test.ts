import { describe, expect, it } from "vitest";
import { resolveCapturedAt } from "../src/utils/clientTime";

const NOW = new Date("2026-09-18T10:00:00.000Z");

describe("resolveCapturedAt — trusting an offline-captured time", () => {
  it("uses server time when the client sent nothing", () => {
    expect(resolveCapturedAt(undefined, NOW)).toEqual(NOW);
  });

  it("uses an earlier time from the same UTC day (a queued offline action)", () => {
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

  it("ignores a time from a different UTC day (never re-dates a record)", () => {
    expect(resolveCapturedAt("2026-09-17T23:30:00.000Z", NOW)).toEqual(NOW);
  });
});
