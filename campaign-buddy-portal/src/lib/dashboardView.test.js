import { describe, it, expect } from 'vitest';
import { formatDelta, formatMoney, daysAgoLabel, fmtDayShort, lastDays } from './dashboardView';

describe('dashboardView', () => {
  it('formatDelta shows direction and a comparison label, or nothing without a baseline', () => {
    expect(formatDelta(12, 'yesterday')).toEqual({ text: '▲ 12% vs yesterday', direction: 'up' });
    expect(formatDelta(-5, 'last week')).toEqual({ text: '▼ 5% vs last week', direction: 'down' });
    expect(formatDelta(0, 'yesterday')).toEqual({ text: 'Same as yesterday', direction: 'flat' });
    expect(formatDelta(null, 'yesterday')).toBeNull();
  });

  it('formatMoney groups thousands', () => {
    expect(formatMoney(184500)).toBe('LKR 184,500');
    expect(formatMoney(0)).toBe('LKR 0');
  });

  it('daysAgoLabel says yesterday for 1 and N days ago otherwise', () => {
    expect(daysAgoLabel(1)).toBe('yesterday');
    expect(daysAgoLabel(3)).toBe('3 days ago');
  });

  it('fmtDayShort formats the calendar date without timezone drift', () => {
    expect(fmtDayShort('2026-10-23')).toBe('Fri 23 Oct');
    expect(fmtDayShort('2026-01-01')).toBe('Thu 1 Jan');
  });

  it('lastDays keeps the newest N rows', () => {
    const rows = [1, 2, 3, 4].map((n) => ({ date: `d${n}` }));
    expect(lastDays(rows, 2)).toEqual([{ date: 'd3' }, { date: 'd4' }]);
    expect(lastDays(rows, 10)).toHaveLength(4);
  });
});
