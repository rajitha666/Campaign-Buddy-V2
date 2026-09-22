import { describe, it, expect } from 'vitest';
import { NAV } from './nav';

describe('NAV', () => {
  it('does not offer /activations/client to the sponsor role', () => {
    const items = NAV.flatMap((s) => s.items || []);
    expect(items.some((i) => i.path === '/activations/client')).toBe(false);
  });

  it('sponsor reports /sponsor/sales under Client Reports as Overall Outlet and SKU Wise — replaces Sales & Foot Fall and Overall SKU wise', () => {
    const reports = NAV.find((s) => s.section === 'Reports');
    const clientReports = reports.items.find((i) => i.label === 'Client Reports');
    const item = clientReports.children.find((c) => c.path === '/sponsor/sales');
    expect(item.label).toBe('Overall Outlet and SKU Wise');
    // the old entries are gone
    expect(clientReports.children.some((c) => c.label === 'Overall SKU wise')).toBe(false);
    const sales = NAV.find((s) => s.section === 'Sales');
    expect((sales.items || []).some((i) => (i.children || i).path === '/sponsor/sales')).toBe(false);
  });

  // Supervisor checklist results are read-only for portal supervisors
  // (outlet-scoped by their campaign grant), full menu for admins.
  // Sponsor must NOT see Task Results.
  it('offers Task Results to admin and supervisor, but not sponsor', () => {
    const items = NAV.flatMap((s) => (s.items || []).flatMap((i) => [i, ...(i.children || []).map((c) => ({ ...c, roles: i.roles }))]));
    const entries = items.filter((i) => i.path === '/supervisor-task-results');
    const roles = new Set(entries.flatMap((e) => e.roles));
    expect([...roles].sort()).toEqual(['admin', 'supervisor']);
  });

  // Admin nav review (2026-09): duplicate pages were moved into a bottom
  // "Archive" section rather than deleted, so nothing can go missing unnoticed.
  const ADMIN_PATHS_BEFORE_ARCHIVE = ['/dashboard', '/clients', '/items', '/brands', '/reorder', '/campaigns', '/activations', '/outlets', '/distributors', '/cities', '/staff', '/staff/attendance', '/staff/absence', '/leave-requests', '/staff/profiles', '/supervisor-tasks', '/supervisor-task-results', '/outlet-attendance', '/supervisor-attendance', '/assign-routes', '/sales', '/sales/sku-wise', '/sales/status', '/sales/outlet-wise', '/sales/update', '/sales/custom-fields', '/tracking/promoter', '/tracking/supervisor', '/tracking/live', '/reports/sku-wise', '/reports/brand-wise', '/reports/monthly-attendance', '/sponsor/sales', '/reports/client-brand-wise', '/promoter-list', '/license', '/issues', '/system-status', '/users', '/roles'];
  const routesFor = (persona) => {
    const paths = new Set();
    for (const sec of NAV) {
      for (const it of sec.items) {
        if (!(it.roles || sec.roles || []).includes(persona)) continue;
        if (it.path) paths.add(it.path);
        for (const c of it.children || []) paths.add(c.path);
      }
    }
    return paths;
  };

  it('admin still reaches every route it had before the archive move', () => {
    const admin = routesFor('admin');
    expect(ADMIN_PATHS_BEFORE_ARCHIVE.filter((p) => !admin.has(p))).toEqual([]);
  });

  it('puts the duplicate admin pages in an admin-only Archive section at the bottom', () => {
    const last = NAV[NAV.length - 1];
    expect(last.section).toBe('Archive');
    expect(last.roles).toEqual(['admin']);
    expect(last.items.map((i) => i.path).sort()).toEqual(
      ['/outlet-attendance', '/promoter-list', '/reports/client-brand-wise', '/sales', '/sponsor/sales'].sort(),
    );
  });

  it('keeps archived pages out of the live admin menus', () => {
    const live = NAV.filter((s) => s.section !== 'Archive' && (s.roles || ['admin']).includes('admin'));
    const paths = live.flatMap((s) => s.items)
      .filter((i) => i.roles.includes('admin'))
      .flatMap((i) => (i.children ? i.children.map((c) => c.path) : [i.path]));
    for (const p of ['/outlet-attendance', '/promoter-list', '/reports/client-brand-wise', '/sales', '/sponsor/sales']) {
      expect(paths).not.toContain(p);
    }
  });

  it('shows Client Reports to sponsors only, and moves Monthly Attendance under Staff', () => {
    const reports = NAV.find((s) => s.section === 'Reports');
    expect(reports.items.find((i) => i.label === 'Client Reports').roles).toEqual(['sponsor']);
    expect(reports.items.some((i) => i.label === 'Admin Reports')).toBe(false);
    const staff = NAV.find((s) => s.section === 'People').items.find((i) => i.label === 'Staff');
    expect(staff.children.some((c) => c.path === '/reports/monthly-attendance')).toBe(true);
  });

  it('leaves the supervisor and sponsor menus untouched', () => {
    expect(routesFor('supervisor').has('/sales')).toBe(false);
    expect(routesFor('sponsor').has('/sponsor/sales')).toBe(true);
    expect(routesFor('sponsor').has('/reports/client-brand-wise')).toBe(true);
    expect(routesFor('supervisor').has('/my-outlet-attendance')).toBe(true);
  });

  // #91 — per-day starting stock, visible to the client (sponsor) as well as staff.
  it("offers Starting Stock under Sales to admin, supervisor and sponsor", () => {
    for (const persona of ["admin", "supervisor", "sponsor"]) {
      expect(routesFor(persona).has("/sales/starting-stock"), persona).toBe(true);
    }
  });
});
