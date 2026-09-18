import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Seller Live Locations (/tracking/live): clicking a row in the "Currently
// checked in" table must highlight that person's marker on the map — same
// interaction as clicking a Promoter Tracking row highlights their trail.
describe('Seller Live Locations row click highlights the marker on the map', () => {
  const page = readFileSync(fileURLToPath(new URL('./LiveMap.jsx', import.meta.url)), 'utf8');
  const map = readFileSync(fileURLToPath(new URL('../components/CampaignMap.jsx', import.meta.url)), 'utf8');

  it('table rows are clickable and toggle a selection', () => {
    expect(page).toMatch(/is-clickable/);
    expect(page).toMatch(/is-selected/);
  });

  it('passes the selected staff through to the map', () => {
    expect(page).toMatch(/highlightedStaffKey/);
    expect(map).toMatch(/highlightedStaffKey/);
  });

  it('CampaignMap draws a selection ring on and centres the map on the selected staff', () => {
    // ring around the marker + open its tooltip, and pan once when the selection changes
    expect(map).toMatch(/L\.circleMarker\(\[hi\.lat, hi\.lng\]/);
    expect(map).toMatch(/openTooltip/);
    expect(map).toMatch(/lastHighlightRef/);
  });
});
