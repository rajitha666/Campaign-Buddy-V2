import { afterEach, describe, it, expect, vi } from 'vitest';
import { formatDay, dayOfMonth, ymd, localDayKey } from './date';

describe('formatDay', () => {
  it('pins a midnight-UTC date-only string to the calendar day (no off-by-one)', () => {
    // 2026-09-06T00:00:00Z formatted on a negative-offset device would slip to
    // Sept 5 without the UTC pin. Assert on the day number, locale-agnostically.
    const out = formatDay('2026-09-06T00:00:00.000Z');
    expect(out).toMatch(/\b6\b/);
    expect(out).not.toMatch(/\b5\b/);
  });

  it('accepts custom Intl options', () => {
    const out = formatDay('2026-01-15T00:00:00.000Z', { month: 'long', day: 'numeric' });
    expect(out).toMatch(/January/);
    expect(out).toMatch(/15/);
  });
});

describe('dayOfMonth', () => {
  it('returns the UTC day of month', () => {
    expect(dayOfMonth('2026-09-06T00:00:00.000Z')).toBe(6);
    expect(dayOfMonth('2026-12-31T00:00:00.000Z')).toBe(31);
  });
});

describe('ymd', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a Date as YYYY-MM-DD', () => {
    expect(ymd(new Date('2026-09-06T12:34:56.000Z'))).toBe('2026-09-06');
  });

  it('defaults to today', () => {
    expect(ymd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rolls over to the next Colombo day before the UTC date does', () => {
    // 18:30–24:00 UTC is already the next Colombo calendar day (UTC+5:30,
    // no DST) — same convention as the backend's dayDate()/colomboYmd().
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-18T20:00:00.000Z')); // 01:30 Colombo Sep 19
    expect(ymd()).toBe('2026-09-19');
  });
});

describe('localDayKey', () => {
  it('uses the device-local calendar day, not the UTC day', () => {
    // Built from local components so it holds in any timezone the tests run in.
    expect(localDayKey(new Date(2026, 8, 6, 1, 30))).toBe('2026-09-06');
    expect(localDayKey(new Date(2026, 8, 6, 23, 59))).toBe('2026-09-06');
    expect(localDayKey(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });
});
