import { describe, it, expect } from 'vitest';
import { addPing, flushPings, pingCount, type PingStore, type BufferedPing } from './pingBuffer';

function makeStore(): PingStore {
  let items: BufferedPing[] = [];
  return { load: async () => items, save: async (n) => { items = n; } };
}
const ping = (n: number): BufferedPing => ({ latitude: 6.9 + n / 1000, longitude: 79.9, timestamp: `2026-09-18T10:0${n}:00.000Z` });
const http = (status: number) => Object.assign(new Error('x'), { response: { status } });

describe('ping buffer', () => {
  it('holds pings in capture order', async () => {
    const store = makeStore();
    await addPing(ping(1), store);
    await addPing(ping(2), store);
    expect(await pingCount(store)).toBe(2);
  });

  it('is bounded — the oldest pings are dropped first', async () => {
    const store = makeStore();
    for (let i = 0; i < 5; i += 1) await addPing(ping(i), store, 3);
    const sent: string[] = [];
    await flushPings(async (p) => { sent.push(p.timestamp); }, { store });
    expect(sent).toEqual([ping(2).timestamp, ping(3).timestamp, ping(4).timestamp]);
  });

  it('flush sends oldest first and empties the buffer', async () => {
    const store = makeStore();
    await addPing(ping(1), store);
    await addPing(ping(2), store);
    const sent: string[] = [];
    const result = await flushPings(async (p) => { sent.push(p.timestamp); }, { store });
    expect(sent).toEqual([ping(1).timestamp, ping(2).timestamp]);
    expect(result).toEqual({ sent: 2, remaining: 0, stopped: false });
  });

  it('a network failure keeps the failed ping and everything after it for next time', async () => {
    const store = makeStore();
    for (const n of [1, 2, 3]) await addPing(ping(n), store);
    let calls = 0;
    const result = await flushPings(async () => { calls += 1; if (calls === 2) throw new Error('offline'); }, { store });
    expect(result).toEqual({ sent: 1, remaining: 2, stopped: true });
    expect(await pingCount(store)).toBe(2);
  });

  it('a ping the server refuses (e.g. shift already closed) is dropped, not retried forever', async () => {
    const store = makeStore();
    for (const n of [1, 2]) await addPing(ping(n), store);
    const result = await flushPings(async () => { throw http(422); }, { store });
    expect(result).toEqual({ sent: 0, remaining: 0, stopped: false });
  });

  it('sends at most `max` per flush so a long outage does not hammer the server', async () => {
    const store = makeStore();
    for (const n of [1, 2, 3, 4]) await addPing(ping(n), store);
    const result = await flushPings(async () => {}, { store, max: 3 });
    expect(result).toEqual({ sent: 3, remaining: 1, stopped: false });
  });
});
