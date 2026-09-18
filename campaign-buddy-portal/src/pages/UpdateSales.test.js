import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The Update Sales screen must offer ONLY the outlet + date pickers. Promoter
// and Activation are derived from the outlet's activation covering the selected
// date (resolved by the sales/lookup backend), not chosen via dropdowns.
// Regression: cascading promoter/activation dropdowns let an admin pair a
// promoter with an activation on a day the activation didn't cover.
describe('UpdateSales shows outlet dropdown only', () => {
  const page = readFileSync(fileURLToPath(new URL('../pages/UpdateSales.jsx', import.meta.url)), 'utf8');

  it('filter bar has no promoter or activation dropdown', () => {
    expect(page).not.toMatch(/staffOptions/);
    expect(page).not.toMatch(/activationOptions/);
    expect(page).not.toMatch(/activationsList/);
  });

  it('still keeps the outlet and date fields', () => {
    expect(page).toMatch(/outletOptions/);
    expect(page).toMatch(/type="date"/);
  });
});
