import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// #114: the Overview used to compose seven requests and page through every
// sales row client-side (#93 made that paging correct; the server now owns it).
// It must load from the one summary endpoint and never walk raw sales rows again.
describe('Dashboard loads from the one summary endpoint', () => {
  const page = readFileSync(fileURLToPath(new URL('./Dashboard.jsx', import.meta.url)), 'utf8');

  it('calls the dashboard endpoint', () => {
    expect(page).toMatch(/dashboardApi\.get\(currentCampaignId\)/);
  });

  it('does not fetch sales/attendance rows or page through them', () => {
    expect(page).not.toMatch(/fetchAllPages/);
    expect(page).not.toMatch(/salesApi|attendanceApi|reportsApi|dailyStatsApi/);
  });

  it('never loads the map (staff/location data) for sponsors', () => {
    expect(page).toMatch(/persona === 'sponsor'\) return;/);
    expect(page).toMatch(/!isSponsor \? \(\s*<div className="panel ov-block">\s*<div className="panel-title">Outlets/);
  });

  it('hides the attention strip from sponsors', () => {
    expect(page).toMatch(/!isSponsor \? <AttentionStrip/);
  });
});
