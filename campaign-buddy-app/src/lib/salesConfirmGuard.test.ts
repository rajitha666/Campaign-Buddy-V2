import { describe, it, expect } from 'vitest';
import { canConfirmSales } from './salesConfirmGuard';

describe('canConfirmSales', () => {
  it('allows confirming when checked in with stats logged', () => {
    expect(canConfirmSales({ confirmed: false, checkedIn: true, footFall: 10, approached: 4 })).toEqual({
      ok: true,
      statsMissing: false,
    });
  });

  it('blocks when foot fall or approached is still 0', () => {
    expect(canConfirmSales({ confirmed: false, checkedIn: true, footFall: 0, approached: 4 })).toEqual({
      ok: false,
      statsMissing: true,
    });
    expect(canConfirmSales({ confirmed: false, checkedIn: true, footFall: 10, approached: 0 })).toEqual({
      ok: false,
      statsMissing: true,
    });
  });

  it('blocks everything once confirmed — button becomes Confirmed ✓', () => {
    expect(canConfirmSales({ confirmed: true, checkedIn: true, footFall: 10, approached: 4 })).toEqual({
      ok: false,
      statsMissing: false,
    });
  });

  it('blocks when not checked in', () => {
    expect(canConfirmSales({ confirmed: false, checkedIn: false, footFall: 10, approached: 4 })).toEqual({
      ok: false,
      statsMissing: false,
    });
  });
});
