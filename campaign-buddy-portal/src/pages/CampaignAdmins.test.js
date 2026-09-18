import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The campaign access page must let admins link / create accounts of any
// back-office role — admins ("usr"), sponsors and supervisors — not only
// Campaign Admins. Regression: the original page hard-wired role "usr".
describe('CampaignAdmins supports assigning any back-office role', () => {
  const page = readFileSync(fileURLToPath(new URL('../pages/CampaignAdmins.jsx', import.meta.url)), 'utf8');
  const endpoints = readFileSync(fileURLToPath(new URL('../lib/endpoints.js', import.meta.url)), 'utf8');

  it('offers a role selector with admin, sponsor and supervisor', () => {
    expect(page).toMatch(/ROLE_OPTIONS\s*=/);
    for (const role of ['usr', 'sponsor', 'supervisor']) {
      expect(page).toContain(`'${role}'`);
    }
  });

  it('fetches candidates with the selected role and sends it on link', () => {
    expect(page).toMatch(/adminCandidates\([^)]*role[^)]*\)/s);
  });

  it('endpoints.js passes the role query to admin-candidates', () => {
    expect(endpoints).toMatch(/adminCandidates[^\n]*\{[^}]*role/);
  });

  it('inline new-account form includes a role choice', () => {
    expect(page).toMatch(/newAdmin.*roleId|roleId.*newAdmin/s);
  });

  it('lists the linked role in the grants table', () => {
    expect(page).toMatch(/g\.user\?\.roleId|roleId.*Badge/is);
  });
});
