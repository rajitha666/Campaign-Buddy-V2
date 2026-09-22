import { describe, it, expect } from 'vitest';
import { targetLabel, targetValueText } from './targetLabel';

// #86/#87: the app shows the daily target for a daily activation and the
// monthly target for a monthly one, in the unit the admin set.
describe('targetLabel', () => {
  it('names the categorisation', () => {
    expect(targetLabel('daily')).toBe('Daily target');
    expect(targetLabel('monthly')).toBe('Monthly target');
  });

  it('falls back to a plain label for an older server that omits it', () => {
    expect(targetLabel(undefined)).toBe('Target');
  });
});

describe('targetValueText', () => {
  it('shows sales-wise targets in LKR', () => {
    expect(targetValueText(500, 'sales_wise')).toBe('LKR 500');
  });

  it('shows unit-wise targets as units', () => {
    expect(targetValueText(500, 'unit_wise')).toBe('500 units');
    expect(targetValueText(1, 'unit_wise')).toBe('1 unit');
  });

  it('keeps the LKR reading when the unit is unknown (older server)', () => {
    expect(targetValueText(500, undefined)).toBe('LKR 500');
  });
});
