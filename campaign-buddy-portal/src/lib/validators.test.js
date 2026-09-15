import { describe, it, expect } from 'vitest';
import { validators, normalizePhone } from './validators';

describe('normalizePhone (outlet tel autofill)', () => {
  it('strips separators and whitespace', () => {
    expect(normalizePhone('+94 71 222 2222')).toBe('+94712222222');
    expect(normalizePhone('+94-71-2222222')).toBe('+94712222222');
    expect(normalizePhone(' +94 (71) 2222222 ')).toBe('+94712222222');
  });

  it('converts local 0-prefix and bare 9-digit numbers', () => {
    expect(normalizePhone('0771234567')).toBe('+94771234567');
    expect(normalizePhone('0112345678')).toBe('+94112345678');
    // bare 9-digit numbers keep a 0 before the subscriber digits
    expect(normalizePhone('772222222')).toBe('+940772222222');
    expect(normalizePhone('112345678')).toBe('+940112345678');
  });

  it('accepts all valid international/local formats', () => {
    expect(normalizePhone('+94771234567')).toBe('+94771234567');
    expect(normalizePhone('  +94771234567 ')).toBe('+94771234567');
    expect(normalizePhone('+94 71 222 2222')).toBe('+94712222222');
    expect(normalizePhone('+94-71-2222222')).toBe('+94712222222');
    expect(normalizePhone('+94 (71) 2222222')).toBe('+94712222222');
    expect(normalizePhone('94771234567')).toBe('+94771234567'); // country code, no +
    expect(normalizePhone('0094771234567')).toBe('+94771234567'); // IDD prefix
  });

  it('leaves empty or already-clean values alone', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe(null);
    expect(normalizePhone(undefined)).toBe(undefined);
    expect(normalizePhone('+94771234567')).toBe('+94771234567');
  });

  it('lets malformed numbers fall through to the strict validator', () => {
    expect(validators.mobile()(normalizePhone('abc'))).toBeTypeOf('string');
    expect(validators.mobile()(normalizePhone('0771234'))).toBeTypeOf('string');
  });
});
