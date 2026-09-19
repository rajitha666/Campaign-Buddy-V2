import { describe, it, expect } from 'vitest';
import { applyPreferencePatch, PREFERENCE_KEYS } from './preferences';

describe('applyPreferencePatch', () => {
  it('sets and replaces keys without touching others', () => {
    expect(applyPreferencePatch({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('removes a key when the value is null, and does not mutate the input', () => {
    const before = { a: 1, b: 2 };
    expect(applyPreferencePatch(before, { a: null })).toEqual({ b: 2 });
    expect(before).toEqual({ a: 1, b: 2 });
  });

  it('knows the favorites key so "reset all" covers it', () => {
    expect(PREFERENCE_KEYS).toContain('menu.favorites');
  });
});
