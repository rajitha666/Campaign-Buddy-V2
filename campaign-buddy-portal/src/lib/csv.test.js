import { describe, it, expect } from 'vitest';
import { csvCell, toCsv } from './csv';

// #92: outlet names with unicode dashes (– — ‑) exported as raw unicode that
// Excel mis-decodes; the CSV must carry a plain ASCII hyphen instead.
describe('csv', () => {
  it('normalizes unicode dash variants to an ASCII hyphen', () => {
    expect(csvCell('Arpico – Nugegoda')).toBe('Arpico - Nugegoda');
    expect(csvCell('Keells — Kandy')).toBe('Keells - Kandy');
    expect(csvCell('Food‑City')).toBe('Food-City');
  });

  it('quotes only fields that need it, doubling embedded quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Outlet, Colombo')).toBe('"Outlet, Colombo"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('renders null/undefined as empty and joins rows with newlines', () => {
    expect(toCsv([['a', null, undefined, 3], ['b', '', 'c', 0]])).toBe('a,,,3\nb,,c,0');
  });
});
