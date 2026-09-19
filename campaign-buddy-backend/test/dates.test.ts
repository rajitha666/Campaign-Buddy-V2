import { afterEach, describe, expect, it, vi } from "vitest";
import { dayDate } from "../src/utils/dates";

describe("dayDate() — Colombo calendar for the implicit 'today'", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls over to the next Colombo day before the UTC date does", () => {
    // 2026-09-18T18:30:00Z = 00:00 Colombo on Sep 19 — the sponsor's rep hit
    // this as a 404 on /v1/me/assignments/today the morning her activation
    // started (18:30–24:00 UTC is already "tomorrow" in Colombo).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T20:00:00.000Z")); // 01:30 Colombo Sep 19
    expect(dayDate().toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("stays on the same day during Colombo daytime", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T12:00:00.000Z")); // 17:30 Colombo Sep 18
    expect(dayDate().toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("does not shift an explicit date string", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T20:00:00.000Z"));
    expect(dayDate("2026-09-18").toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });
});
