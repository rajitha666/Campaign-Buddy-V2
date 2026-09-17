import { describe, it, expect } from 'vitest';
import { parseStepperInput } from './stepper';

describe('parseStepperInput', () => {
  it('parses plain digits', () => {
    expect(parseStepperInput('42', 0)).toBe(42);
  });

  it('strips non-digit characters typed by mistake', () => {
    expect(parseStepperInput('1o2', 0)).toBe(12);
  });

  it('falls back to min when the field is emptied', () => {
    expect(parseStepperInput('', 0)).toBe(0);
    expect(parseStepperInput('', 5)).toBe(5);
  });

  it('clamps below min', () => {
    expect(parseStepperInput('3', 10)).toBe(10);
  });

  it('clamps above max', () => {
    expect(parseStepperInput('999', 0, 60)).toBe(60);
  });

  it('has no upper bound when max is omitted', () => {
    expect(parseStepperInput('123456', 0)).toBe(123456);
  });
});
