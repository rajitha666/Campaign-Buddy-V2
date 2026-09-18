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

  it('CampaignMap draws a selection ring on the selected staff without moving the map', () => {
    // ring around the marker + open its tooltip; the map view must be left alone
    expect(map).toMatch(/L\.circleMarker\(\[hi\.lat, hi\.lng\]/);
    expect(map).toMatch(/openTooltip/);
    // no pan/zoom on selection — clicking a row must not change the map view
    expect(map).not.toMatch(/setView\(\[hi\.lat/);
    // the selected marker's dot is recolored, not just ringed
    expect(map).toMatch(/geo-staff-dot--selected/);
  });

  it('both map components use the shared minimal light basemap', () => {
    const trail = readFileSync(fileURLToPath(new URL('../components/PromoterTrailMap.jsx', import.meta.url)), 'utf8');
    const base = readFileSync(fileURLToPath(new URL('../components/baseLayer.js', import.meta.url)), 'utf8');
    expect(map).toMatch(/addBaseLayer\(map\)/);
    expect(trail).toMatch(/addBaseLayer\(map\)/);
    // keyless — no API key/watermark overlay (CARTO's anonymous raster tiles are watermarked)
    expect(base).toMatch(/World_Light_Gray_Base/);
    expect(base).not.toMatch(/cartocdn/);
  });
});
