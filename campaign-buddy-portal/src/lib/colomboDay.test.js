import { describe, it, expect, vi, afterEach } from 'vitest';
import { colomboYmd } from './colomboDay';

describe('colomboYmd', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the Colombo calendar day (UTC+5:30), not the UTC day', () => {
    // 18:30–24:00 UTC is already the next Colombo day — an admin opening the
    // portal 00:00–05:30 Colombo would otherwise default filters to yesterday.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-18T20:00:00.000Z')); // 01:30 Colombo Sep 19
    expect(colomboYmd()).toBe('2026-09-19');
  });

  it('stays on the same day during Colombo daytime', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-18T12:00:00.000Z')); // 17:30 Colombo Sep 18
    expect(colomboYmd()).toBe('2026-09-18');
  });
});
