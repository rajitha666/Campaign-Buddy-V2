import { describe, it, expect } from 'vitest';
import { decidePing, tooSoon, nextCheckDelayMs, MIN_GAP_MS, HEARTBEAT_MS } from './pingPolicy';

const T0 = 1_000_000;
// ~0.0001° of latitude ≈ 11 m
const at = (dLat: number, accuracyMeters?: number) => ({ latitude: 6.9 + dLat, longitude: 79.9, accuracyMeters });
const last = (over: Partial<{ at: number; accuracyMeters: number }> = {}) => ({ ...at(0, 10), at: T0, ...over });

describe('ping policy', () => {
  it('always sends the first ping of a shift', () => {
    expect(decidePing({ last: null, fix: at(0), now: T0, force: false }).send).toBe(true);
  });

  it('ignores indoor GPS jitter smaller than the minimum distance or the reported accuracy', () => {
    const now = T0 + 60_000;
    expect(decidePing({ last: last(), fix: at(0.0002), now, force: false }).send).toBe(false); // ~22 m
    expect(decidePing({ last: last(), fix: at(0.0004, 80), now, force: false }).send).toBe(false); // ~44 m, but ±80 m accuracy
  });

  it('sends once the rep has really moved', () => {
    const r = decidePing({ last: last(), fix: at(0.001, 10), now: T0 + 60_000, force: false }); // ~111 m
    expect(r).toEqual({ send: true, moved: true });
  });

  it('sends a heartbeat when stationary for long enough, but not sooner', () => {
    expect(decidePing({ last: last(), fix: at(0), now: T0 + HEARTBEAT_MS - 1, force: false }).send).toBe(false);
    expect(decidePing({ last: last(), fix: at(0), now: T0 + HEARTBEAT_MS, force: false }).send).toBe(true);
  });

  it('a forced ping (resume from background) sends even when stationary…', () => {
    expect(decidePing({ last: last(), fix: at(0), now: T0 + MIN_GAP_MS, force: true }).send).toBe(true);
  });

  it('…but never a second ping right after one was already captured', () => {
    const now = T0 + MIN_GAP_MS - 1;
    expect(tooSoon(last(), now)).toBe(true);
    expect(decidePing({ last: last(), fix: at(0.01), now, force: true }).send).toBe(false);
    expect(tooSoon(last(), T0 + MIN_GAP_MS)).toBe(false);
    expect(tooSoon(null, T0)).toBe(false);
  });

  it('backs off the check interval while the rep stays put, and resets on movement', () => {
    const delays = [0, 1, 2, 3, 4, 10].map(nextCheckDelayMs);
    expect(delays[0]).toBe(60_000);
    expect(delays[2]).toBeGreaterThan(delays[0]);
    expect(delays[4]).toBeGreaterThan(delays[2]);
    expect(delays[5]).toBe(delays[4]); // capped
    expect(delays[5]).toBeLessThanOrEqual(HEARTBEAT_MS);
  });
});
