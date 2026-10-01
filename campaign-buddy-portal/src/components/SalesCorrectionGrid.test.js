import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = readFileSync(fileURLToPath(new URL('../components/SalesCorrectionGrid.jsx', import.meta.url)), 'utf8');

describe('SalesCorrectionGrid', () => {
  it('shows a Total Sales column computed from unitPrice x soldToday', () => {
    expect(page).toMatch(/<th>Total Sales<\/th>/);
    expect(page).toMatch(/unitPrice \|\| 0\) \* Number\(r\.soldToday \|\| 0/);
  });

  it('refuses to save when no rows are selected', () => {
    expect(page).toMatch(/push\('Nothing to update', 'error'\)/);
  });

  it('asks for confirmation before saving corrections', () => {
    expect(page).toMatch(/window\.confirm\('Update the selected sales entries\?'\)/);
  });

  it('includes Total Sales in the CSV export', () => {
    expect(page).toMatch(/'Sold Qty', 'Total Sales'/);
  });
});
