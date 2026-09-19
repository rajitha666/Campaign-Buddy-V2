import { describe, it, expect } from 'vitest';
import { retryDelayMs } from './backoff';

describe('retryDelayMs', () => {
  it('starts at 30s and doubles per consecutive failure', () => {
    expect(retryDelayMs(0)).toBe(30_000);
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
  });

  it('caps at 2 minutes — the app is open in the rep\'s hand, so recovery after an outage should be prompt', () => {
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(30)).toBe(120_000);
  });
});
