import { describe, it, expect } from 'vitest';
import { formatDay, dayOfMonth, ymd } from './date';

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
  it('formats a Date as YYYY-MM-DD', () => {
    expect(ymd(new Date('2026-09-06T12:34:56.000Z'))).toBe('2026-09-06');
  });

  it('defaults to today', () => {
    expect(ymd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
