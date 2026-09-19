import { describe, it, expect } from 'vitest';
import { createEmitter } from './events';

describe('emitter', () => {
  it('delivers to subscribers until they unsubscribe', () => {
    const e = createEmitter<number>();
    const seen: number[] = [];
    const off = e.subscribe((n) => seen.push(n));
    e.emit(1);
    off();
    e.emit(2);
    expect(seen).toEqual([1]);
  });

  it('one failing subscriber does not stop the others', () => {
    const e = createEmitter<number>();
    const seen: number[] = [];
    e.subscribe(() => { throw new Error('boom'); });
    e.subscribe((n) => seen.push(n));
    e.emit(7);
    expect(seen).toEqual([7]);
  });
});
