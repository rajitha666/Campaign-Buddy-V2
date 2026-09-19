import { describe, it, expect } from 'vitest';
import { createSyncClock } from './syncClock';

describe('sync clock', () => {
  it('notifies listeners with the ISO time of a successful server contact', () => {
    const clock = createSyncClock();
    const seen: string[] = [];
    clock.subscribe((iso) => seen.push(iso));
    clock.note(Date.parse('2026-09-18T10:00:00.000Z'));
    expect(seen).toEqual(['2026-09-18T10:00:00.000Z']);
  });

  it('throttles bursts (a screen firing several reads at once) to one notification', () => {
    const clock = createSyncClock();
    const seen: string[] = [];
    clock.subscribe((iso) => seen.push(iso));
    const t = Date.parse('2026-09-18T10:00:00.000Z');
    clock.note(t);
    clock.note(t + 2_000);
    clock.note(t + 11_000);
    expect(seen).toHaveLength(2);
  });

  it('stops notifying after unsubscribe', () => {
    const clock = createSyncClock();
    const seen: string[] = [];
    const off = clock.subscribe((iso) => seen.push(iso));
    off();
    clock.note(Date.now());
    expect(seen).toEqual([]);
  });
});
