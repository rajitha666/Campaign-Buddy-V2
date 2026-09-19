import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Assign Routes must scope its supervisor dropdown to the CURRENT campaign
// (routes ∪ activation assignments), not to the global staff pool — and show
// a hint rather than silently offering all supervisors when none are on it.
describe('AssignRoutes scopes supervisors to the current campaign', () => {
  const page = readFileSync(fileURLToPath(new URL('./AssignRoutes.jsx', import.meta.url)), 'utf8');

  it('fetches supervisors via the campaign-scoped endpoint, not global /staff', () => {
    expect(page).toMatch(/campaignsApi\.supervisors\(/);
    expect(page).not.toMatch(/staffApi\.search/);
  });

  it('refetches when the current campaign changes', () => {
    expect(page).toMatch(/currentCampaignId/);
    // the supervisors effect's dependency array is keyed on the campaign
    expect(page).toMatch(/\},\s*\[currentCampaignId\]\);/);
  });

  it('clears the selection when no supervisors are on the campaign', () => {
    expect(page).toMatch(/setSupervisorId\(sup\[0\]\?\.id \|\| ''\)/);
  });

  it('shows an empty-campaign hint instead of a global fallback', () => {
    expect(page).toMatch(/No supervisors assigned to this campaign yet/);
  });
});
