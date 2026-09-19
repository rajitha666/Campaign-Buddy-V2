import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// A bare list() call defaults to the backend's 25-per-page cap, so dropdown
// options silently truncate past the first page. These pickers must request a
// large pageSize (same as resources.jsx's optionsFrom()).
describe('dropdown sources request pageSize beyond the 25-row cap', () => {
  it('UpdateSales outlet picker passes pageSize', () => {
    expect(src('../pages/UpdateSales.jsx')).toMatch(/outletsApi\.list\(\{ pageSize: 1000 \}\)/);
  });

  it('CampaignItems product picker passes pageSize', () => {
    expect(src('../pages/CampaignItems.jsx')).toMatch(/itemsApi\.list\(\{ pageSize: 1000 \}\)/);
  });

  it('ActivationItems product picker passes pageSize', () => {
    expect(src('../pages/ActivationItems.jsx')).toMatch(/itemsApi\.list\(\{ pageSize: 1000 \}\)/);
  });

  it('Topbar campaign switcher passes pageSize', () => {
    expect(src('../context/AuthContext.jsx')).toMatch(/campaignsApi\.list\(\{ pageSize: 1000 \}\)/);
  });
});
