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
});
