import { describe, it, expect } from 'vitest';
import { hasExceededInactivityTimeout, INACTIVITY_TIMEOUT_MS } from './inactivity';

describe('hasExceededInactivityTimeout', () => {
  it('is false just under the timeout', () => {
    expect(hasExceededInactivityTimeout(0, INACTIVITY_TIMEOUT_MS - 1)).toBe(false);
  });

  it('is true once the timeout is reached', () => {
    expect(hasExceededInactivityTimeout(0, INACTIVITY_TIMEOUT_MS)).toBe(true);
  });

  it('is true well past the timeout (e.g. app backgrounded for an hour)', () => {
    expect(hasExceededInactivityTimeout(0, 60 * 60 * 1000)).toBe(true);
  });

  it('is false if the clock moved backwards', () => {
    expect(hasExceededInactivityTimeout(10_000, 5_000)).toBe(false);
  });
});
