import { describe, it, expect } from 'vitest';
import { defaultDateRange } from './defaultDateRange';

describe('defaultDateRange', () => {
  it('week = last 7 days including today', () => {
    expect(defaultDateRange('week', null, '2026-10-25')).toEqual({ dateFrom: '2026-10-19', dateTo: '2026-10-25' });
    expect(defaultDateRange('week', null, '2026-03-02')).toEqual({ dateFrom: '2026-02-24', dateTo: '2026-03-02' }); // crosses a month end
  });

  it('campaign = start to today while the campaign is running', () => {
    const c = { startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-31T00:00:00.000Z' };
    expect(defaultDateRange('campaign', c, '2026-10-25')).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-25' });
  });

  it('campaign = start to end once it is over', () => {
    const c = { startDate: '2026-08-01', endDate: '2026-08-31' };
    expect(defaultDateRange('campaign', c, '2026-10-25')).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });
  });

  it('a campaign that has not started yet never yields an inverted range', () => {
    const c = { startDate: '2026-12-01', endDate: '2026-12-31' };
    const r = defaultDateRange('campaign', c, '2026-10-25');
    expect(r.dateFrom <= r.dateTo).toBe(true);
    expect(r).toEqual({ dateFrom: '2026-10-25', dateTo: '2026-10-25' });
  });

  it('falls back to 30 days when there is no campaign, and to nothing for unknown kinds', () => {
    expect(defaultDateRange('campaign', null, '2026-10-25')).toEqual({ dateFrom: '2026-09-25', dateTo: '2026-10-25' });
    expect(defaultDateRange(undefined, null, '2026-10-25')).toEqual({});
  });
});
