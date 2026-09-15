import { describe, it, expect } from 'vitest';
import { validators, normalizePhone } from './validators';

describe('normalizePhone (outlet tel autofill)', () => {
  it('strips separators and whitespace, converting to local format', () => {
    expect(normalizePhone('+94 71 222 2222')).toBe('0712222222');
    expect(normalizePhone('+94-71-2222222')).toBe('0712222222');
    expect(normalizePhone(' +94 (71) 2222222 ')).toBe('0712222222');
  });

  it('keeps an already-local number, and fills in the 0 for a bare 9-digit mobile number', () => {
    expect(normalizePhone('0771234567')).toBe('0771234567');
    expect(normalizePhone('0112345678')).toBe('0112345678');
    expect(normalizePhone('772222222')).toBe('0772222222');
    // A 9-digit number NOT starting with 7 isn't a recognized mobile pattern
    // (matches backend src/utils/phone.ts normalizeLkPhone) — left alone
    // rather than guessed at, so the validator catches it as incomplete.
    expect(normalizePhone('112345678')).toBe('112345678');
  });

  it('accepts all valid international/local formats', () => {
    expect(normalizePhone('+94771234567')).toBe('0771234567');
    expect(normalizePhone('  +94771234567 ')).toBe('0771234567');
    expect(normalizePhone('+94 71 222 2222')).toBe('0712222222');
    expect(normalizePhone('+94-71-2222222')).toBe('0712222222');
    expect(normalizePhone('+94 (71) 2222222')).toBe('0712222222');
    expect(normalizePhone('94771234567')).toBe('0771234567'); // country code, no +
  });

  it('keeps a foreign E.164 number as-is (no local-SL form exists for it)', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
  });

  it('leaves empty or already-clean values alone', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe(null);
    expect(normalizePhone(undefined)).toBe(undefined);
    expect(normalizePhone('0771234567')).toBe('0771234567');
  });

  it('lets malformed numbers fall through to the strict validator', () => {
    expect(validators.mobile()(normalizePhone('abc'))).toBeTypeOf('string');
    expect(validators.mobile()(normalizePhone('0771234'))).toBeTypeOf('string');
    expect(validators.mobile()(normalizePhone('112345678'))).toBeTypeOf('string');
  });

  it('accepts a valid local number and a foreign E.164 number', () => {
    expect(validators.mobile()(normalizePhone('0771234567'))).toBeNull();
    expect(validators.mobile()(normalizePhone('+14155552671'))).toBeNull();
  });
});
