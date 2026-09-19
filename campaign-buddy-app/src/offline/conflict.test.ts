import { describe, it, expect } from 'vitest';
import { pickBase, detectConflict, describeConflict } from './conflict';

describe('pickBase', () => {
  it('captures the pre-edit value of only the fields being written', () => {
    expect(pickBase('stats', { footFall: 45 }, { footFall: 43, approached: 24, converted: 9 })).toEqual({ footFall: 43 });
  });

  it('tracks stock fields, ignoring custom fields and untracked kinds', () => {
    expect(
      pickBase('productStock', { soldToday: 5, customFields: { a: 1 } }, { soldToday: 4, openingStock: 60, reorderFlag: false })
    ).toEqual({ soldToday: 4 });
    expect(pickBase('salesConfirm', { remarks: 'x' }, { remarks: 'y' })).toBeUndefined();
  });
});

describe('detectConflict', () => {
  const base = { footFall: 43, approached: 24 };

  it('no conflict when the server still holds what the edit started from', () => {
    expect(detectConflict('stats', { footFall: 45, approached: 25 }, base, { footFall: 43, approached: 24, converted: 9 })).toEqual([]);
  });

  it('conflict when someone else changed a field the edit overwrites', () => {
    expect(detectConflict('stats', { footFall: 45 }, base, { footFall: 50, approached: 24 })).toEqual([
      { field: 'footFall', base: 43, server: 50, mine: 45 },
    ]);
  });

  it('no conflict when the server already has the value being written', () => {
    expect(detectConflict('stats', { footFall: 45 }, base, { footFall: 45 })).toEqual([]);
  });

  it("ignores fields the edit doesn't touch, even if they changed on the server", () => {
    expect(detectConflict('stats', { footFall: 45 }, base, { footFall: 43, approached: 99 })).toEqual([]);
  });

  it('works for stock', () => {
    expect(
      detectConflict('productStock', { soldToday: 5 }, { soldToday: 4 }, { soldToday: 9, openingStock: 60 })
    ).toEqual([{ field: 'soldToday', base: 4, server: 9, mine: 5 }]);
  });
});

describe('describeConflict', () => {
  it('reads as a plain sentence per field', () => {
    expect(describeConflict([{ field: 'footFall', base: 43, server: 50, mine: 45 }])).toBe('Foot fall: office has 50, you entered 45');
  });
});
