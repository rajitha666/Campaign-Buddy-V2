// Regression: data-table cells must wrap instead of forcing nowrap, so every
// table fits the window width — nowrap pushed tables wider than the viewport
// and clipped the last rows once the horizontal scrollbar appeared.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./app.css', import.meta.url)), 'utf8');

describe('data tables fit the window (no horizontal clipping)', () => {
  it('table.data-table td does not force nowrap', () => {
    const td = css.match(/table\.data-table td\s*\{[^}]*\}/);
    expect(td).toBeTruthy();
    expect(td[0]).not.toMatch(/white-space\s*:\s*nowrap/);
  });

  it('table.data-table th does not force nowrap', () => {
    const th = css.match(/table\.data-table th\s*\{[^}]*\}/);
    expect(th).toBeTruthy();
    expect(th[0]).not.toMatch(/white-space\s*:\s*nowrap/);
  });
});
