import { describe, it, expect } from 'vitest';
import { NAV } from './nav';
import { LEGACY_REDIRECTS, redirectFor } from './legacyPaths';

// Pages in a persona's menu: every item, plus the tabs inside grouped items.
const itemsFor = (persona) => NAV.flatMap((sec) => (sec.roles && !sec.roles.includes(persona) ? [] : sec.items))
  .filter((it) => it.roles.includes(persona));
const routesFor = (persona) => {
  const paths = new Set();
  for (const it of itemsFor(persona)) {
    if (it.path) paths.add(it.path);
    for (const c of it.children || []) paths.add(c.path);
  }
  return paths;
};
const groupsFor = (persona) => NAV.filter((s) => s.section && (!s.roles || s.roles.includes(persona))
  && s.items.some((it) => it.roles.includes(persona)));

describe('NAV', () => {
  it('does not offer /activations/client to the sponsor role', () => {
    const items = NAV.flatMap((s) => s.items || []);
    expect(items.some((i) => i.path === '/activations/client')).toBe(false);
  });

  it('sponsor reports /sponsor/sales under Client Reports as Overall Outlet and SKU Wise', () => {
    const clientReports = itemsFor('sponsor').find((i) => i.label === 'Client Reports');
    expect(clientReports.children.find((c) => c.path === '/sponsor/sales').label).toBe('Overall Outlet and SKU Wise');
    expect(clientReports.children.some((c) => c.label === 'Overall SKU wise')).toBe(false);
  });

  // Supervisor checklist results are read-only for portal supervisors
  // (outlet-scoped by their campaign grant), full menu for admins.
  // Sponsor must NOT see Task Results.
  it('offers Task Results to admin and supervisor, but not sponsor', () => {
    expect(routesFor('admin').has('/supervisor-task-results')).toBe(true);
    expect(routesFor('supervisor').has('/supervisor-task-results')).toBe(true);
    expect(routesFor('sponsor').has('/supervisor-task-results')).toBe(false);
  });

  // #91 — per-day starting stock, visible to the client (sponsor) as well as staff.
  it('offers Starting Stock to admin, supervisor and sponsor', () => {
    for (const persona of ['admin', 'supervisor', 'sponsor']) {
      expect(routesFor(persona).has('/sales/starting-stock'), persona).toBe(true);
    }
  });

  it('leaves the supervisor and sponsor pages they had before', () => {
    expect(routesFor('supervisor').has('/sales')).toBe(false);
    for (const p of ['/my-outlet-attendance', '/my-leave-requests', '/my-campaigns', '/sales/sku-wise', '/tracking/live']) {
      expect(routesFor('supervisor').has(p), p).toBe(true);
    }
    for (const p of ['/sponsor/sales', '/reports/client-brand-wise', '/staff/attendance', '/supervisor-attendance', '/tracking/supervisor']) {
      expect(routesFor('sponsor').has(p), p).toBe(true);
    }
  });
});

// #116 — simple menu: few groups, one level, no repeats.
describe('menu rules (#116)', () => {
  for (const persona of ['admin', 'supervisor', 'sponsor']) {
    it(`${persona}: at most 7 groups and no Archive`, () => {
      const groups = groupsFor(persona);
      expect(groups.length).toBeLessThanOrEqual(7);
      expect(groups.map((g) => g.section)).not.toContain('Archive');
    });

    it(`${persona}: no page is offered twice`, () => {
      const seen = [];
      for (const it of itemsFor(persona)) {
        if (it.path) seen.push(it.path);
        for (const c of it.children || []) seen.push(c.path);
      }
      expect(seen.filter((p, i) => seen.indexOf(p) !== i)).toEqual([]);
    });

    it(`${persona}: a tab never repeats its group name, and tabs are not nested further`, () => {
      for (const it of itemsFor(persona)) {
        for (const c of it.children || []) {
          expect(c.label.toLowerCase(), `${it.label} > ${c.label}`).not.toBe(it.label.toLowerCase());
          expect(c.children).toBeUndefined();
        }
      }
    });
  }

  it('admin reaches every page it could before, either in the menu or via a redirect', () => {
    const BEFORE = ['/dashboard', '/clients', '/items', '/brands', '/reorder', '/campaigns', '/activations', '/outlets', '/distributors', '/cities', '/staff', '/staff/attendance', '/staff/absence', '/leave-requests', '/staff/profiles', '/supervisor-tasks', '/supervisor-task-results', '/outlet-attendance', '/supervisor-attendance', '/assign-routes', '/sales', '/sales/sku-wise', '/sales/status', '/sales/outlet-wise', '/sales/update', '/sales/custom-fields', '/tracking/promoter', '/tracking/supervisor', '/tracking/live', '/reports/sku-wise', '/reports/brand-wise', '/reports/monthly-attendance', '/sponsor/sales', '/reports/client-brand-wise', '/promoter-list', '/license', '/issues', '/system-status', '/users', '/roles'];
    const admin = routesFor('admin');
    expect(BEFORE.filter((p) => !admin.has(p) && !redirectFor(p, 'admin'))).toEqual([]);
  });

  it('every retired page sends admins to a page they can open', () => {
    for (const path of Object.keys(LEGACY_REDIRECTS)) {
      const to = redirectFor(path, 'admin');
      expect(to, path).toBeTruthy();
      expect(routesFor('admin').has(to), `${path} -> ${to}`).toBe(true);
    }
  });

  it('sponsors keep their own report pages (not redirected)', () => {
    expect(redirectFor('/sponsor/sales', 'sponsor')).toBeNull();
    expect(redirectFor('/reports/client-brand-wise', 'sponsor')).toBeNull();
    expect(redirectFor('/sponsor/sales', 'admin')).toBe('/sales/sku-wise');
  });
});
