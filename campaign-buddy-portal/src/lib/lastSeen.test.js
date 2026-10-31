import { describe, it, expect } from 'vitest';
import { lastSeenLabel, isStale, STALE_AFTER_MS } from './lastSeen';

const now = Date.parse('2026-10-25T10:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();

describe('lastSeen', () => {
  it('labels how long ago the last ping was', () => {
    expect(lastSeenLabel(null, now)).toBe('No position yet');
    expect(lastSeenLabel('garbage', now)).toBe('No position yet');
    expect(lastSeenLabel(ago(20_000), now)).toBe('Just now');
    expect(lastSeenLabel(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(lastSeenLabel(ago(75 * 60_000), now)).toBe('1 h 15 min ago');
    expect(lastSeenLabel(ago(-30_000), now)).toBe('Just now'); // device clock a little ahead
  });

  it('a 5-minute stationary heartbeat is never stale; several missed beats are', () => {
    expect(isStale(ago(5 * 60_000), now)).toBe(false);
    expect(isStale(ago(STALE_AFTER_MS), now)).toBe(false);
    expect(isStale(ago(STALE_AFTER_MS + 1000), now)).toBe(true);
    expect(isStale(null, now)).toBe(false);
  });
});
