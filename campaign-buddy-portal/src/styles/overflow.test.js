import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// SearchableSelect renders its dropdown menu absolutely-positioned inside its
// wrapper. Any card class that clips overflow (e.g. .table-card's
// overflow:hidden) cuts the menu off — regression: the Campaign Admins
// "Link an existing admin account" dropdown was hidden under the panel.
// The escape hatch class must keep cards clipped elsewhere but visible here.
describe('overflow-visible card escape hatch for SearchableSelect', () => {
const css = readFileSync(fileURLToPath(new URL('./app.css', import.meta.url)), 'utf8');
const page = readFileSync(fileURLToPath(new URL('../pages/CampaignAdmins.jsx', import.meta.url)), 'utf8');

  it('app.css defines .table-card.allow-overflow with overflow visible', () => {
    expect(css).toMatch(/\.table-card\.allow-overflow\s*\{[^}]*overflow\s*:\s*visible/);
  });

  it('CampaignAdmins filter card opts into allow-overflow', () => {
    expect(page).toMatch(/className="table-card allow-overflow"/);
  });
});
