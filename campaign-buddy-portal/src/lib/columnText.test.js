import { describe, it, expect } from 'vitest';
import { columnText } from './columnText';

describe('columnText', () => {
  it('uses render() when it returns a plain string, even if the key has no raw field', () => {
    const col = { key: 'itemName', render: (r) => r.activationItem?.campaignItem?.item?.name || '—' };
    const row = { activationItem: { campaignItem: { item: { name: 'Frella Amla Oil' } } } };
    expect(columnText(col, row)).toBe('Frella Amla Oil');
  });

  it('uses render() for a computed value with no raw field at all', () => {
    const col = { key: 'remainingStock', render: (r) => (r.openingStock ?? 0) - (r.soldToday ?? 0) };
    expect(columnText(col, { openingStock: 10, soldToday: 3 })).toBe(7);
  });

  it('falls back to the raw field when render() returns a JSX element', () => {
    const col = { key: 'status', render: (r) => ({ type: 'span', props: { children: r.status } }) };
    expect(columnText(col, { status: 'active' })).toBe('active');
  });

  it('prefers an explicit csvValue over render()', () => {
    const col = { key: 'updatedAt', csvValue: (r) => (r.updatedAt ? 'Completed' : 'Missing'), render: () => ({ type: 'span' }) };
    expect(columnText(col, { updatedAt: null })).toBe('Missing');
  });

  // #92: the on-screen '—' placeholder for a missing value must not leak into
  // exports as if it were data.
  it('exports a missing value as empty instead of the on-screen dash placeholder', () => {
    const col = { key: 'outletName', render: (r) => r.activation?.outlet?.name || '—' };
    expect(columnText(col, {})).toBe('');
    expect(columnText(col, { outletName: 'Fallback' })).toBe('Fallback');
  });

  it('reads the raw field when there is no render or csvValue', () => {
    expect(columnText({ key: 'name' }, { name: 'Outlet A' })).toBe('Outlet A');
  });
});
