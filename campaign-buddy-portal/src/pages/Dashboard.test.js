import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The "Sales this week" bars must show each day's sales value above the bar,
// in the compact k-abbreviated format used by TrendChart (e.g. 128.4k).
// Regression: bars displayed with no amounts, so values were unreadable.
describe('Dashboard sales-week bars show values', () => {
  const page = readFileSync(fileURLToPath(new URL('./Dashboard.jsx', import.meta.url)), 'utf8');

  it('renders a bar-val label above each bar', () => {
    expect(page).toMatch(/bar-val/);
    expect(page).toMatch(/bar-val.*\{fmtShort\(w\.totalSales\)\}/s);
  });

  it('abbreviates values in the k format like TrendChart', () => {
    expect(page).toMatch(/function fmtShort\(n\)/);
    expect(page).toMatch(/\/ 1000\)\.toFixed/);
  });
});
