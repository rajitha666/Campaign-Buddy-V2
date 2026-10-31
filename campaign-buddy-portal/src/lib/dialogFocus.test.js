import { describe, it, expect } from 'vitest';
import { nextTabTarget } from './dialogFocus';

describe('nextTabTarget (focus trap)', () => {
  it('wraps Tab from the last control back to the first', () => {
    expect(nextTabTarget(3, 2, false)).toBe(0);
  });
  it('wraps Shift+Tab from the first control to the last', () => {
    expect(nextTabTarget(3, 0, true)).toBe(2);
  });
  it('lets the browser move focus normally inside the dialog', () => {
    expect(nextTabTarget(3, 1, false)).toBeNull();
    expect(nextTabTarget(3, 1, true)).toBeNull();
  });
  it('pulls focus in when it is outside the dialog or the dialog has no controls', () => {
    expect(nextTabTarget(3, -1, false)).toBe(0);
    expect(nextTabTarget(3, -1, true)).toBe(2);
    expect(nextTabTarget(0, -1, false)).toBe(-1);
  });
});
