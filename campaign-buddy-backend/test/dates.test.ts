import { afterEach, describe, expect, it, vi } from "vitest";
import {
  colomboMonth,
  colomboYmd,
  dayBounds,
  dayDate,
  lastDayOfMonth,
} from "../src/utils/dates";

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

describe("colomboYmd / colomboMonth / lastDayOfMonth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("colomboYmd uses the Colombo calendar, not UTC", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T20:00:00.000Z")); // 01:30 Colombo Sep 19
    expect(colomboYmd()).toBe("2026-09-19");
  });

  it("colomboMonth uses the Colombo month, not UTC", () => {
    // 23:00 UTC on the 30th is already the 1st of the next Colombo month.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-30T23:00:00.000Z")); // 04:30 Colombo Aug 31
    expect(colomboMonth()).toBe("2026-08");
    vi.setSystemTime(new Date("2026-08-31T19:00:00.000Z")); // 00:30 Colombo Sep 1
    expect(colomboMonth()).toBe("2026-09");
  });

  it("lastDayOfMonth uses fixed UTC month bounds, not container-local time", () => {
    // Container TZ is UTC in CI, but this must be TZ-independent anyway.
    expect(lastDayOfMonth("2026-02").toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(lastDayOfMonth("2024-02").toISOString()).toBe("2024-02-29T00:00:00.000Z"); // leap year
    expect(lastDayOfMonth("2026-08").toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("dayBounds still covers exactly one UTC calendar day", () => {
    const b = dayBounds("2026-08-31");
    expect(b.gte.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(b.lt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
