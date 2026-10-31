import { describe, it, expect } from 'vitest';
import { NAV } from '../config/nav';
import { tabsFor, itemPath, itemIsActive } from './navTabs';

describe('tabsFor', () => {
  it('returns the sibling pages of a grouped page for the persona that owns the group', () => {
    const t = tabsFor(NAV, 'admin', '/staff/absence');
    expect(t.group).toBe('Attendance');
    expect(t.tabs.map((x) => x.path)).toEqual(['/staff/attendance', '/staff/absence', '/reports/monthly-attendance']);
  });

  it('is null for single pages and for personas without the group', () => {
    expect(tabsFor(NAV, 'admin', '/clients')).toBeNull();
    expect(tabsFor(NAV, 'sponsor', '/staff/absence')).toBeNull();
    expect(tabsFor(NAV, 'sponsor', '/sponsor/sales').tabs).toHaveLength(2);
  });
});

describe('itemPath / itemIsActive', () => {
  const staff = NAV.find((s) => s.section === 'People').items.find((i) => i.label === 'Staff');
  it('a grouped item opens its first tab and is active on any tab', () => {
    expect(itemPath(staff)).toBe('/staff');
    expect(itemIsActive(staff, '/staff/profiles')).toBe(true);
    expect(itemIsActive(staff, '/clients')).toBe(false);
  });
});
