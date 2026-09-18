import { describe, it, expect } from 'vitest';
import { NAV } from './nav';

describe('NAV', () => {
  it('does not offer /activations/client to the sponsor role', () => {
    const items = NAV.flatMap((s) => s.items || []);
    expect(items.some((i) => i.path === '/activations/client')).toBe(false);
  });
});
