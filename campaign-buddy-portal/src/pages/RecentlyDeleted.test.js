import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV } from '../config/nav';
import { ENTITY_LABELS, formatWhen } from './RecentlyDeleted';

const page = readFileSync(fileURLToPath(new URL('./RecentlyDeleted.jsx', import.meta.url)), 'utf8');

describe('Recently deleted screen (#113)', () => {
  it('is an Admin-section menu item for admins only', () => {
    const admin = NAV.find((s) => s.section === 'Admin');
    const item = admin.items.find((i) => i.path === '/recently-deleted');
    expect(item).toBeTruthy();
    expect(item.roles).toEqual(['admin']);
  });

  it('names every type the API can return, and shows an empty state', () => {
    for (const t of ['client', 'brand', 'item', 'city', 'outlet', 'staff', 'campaign', 'activation', 'sales_record']) {
      expect(ENTITY_LABELS[t]).toBeTruthy();
    }
    expect(page).toMatch(/Nothing deleted recently\./);
  });

  it('restores through the row\'s own server-built path and explains a blocked restore', () => {
    expect(page).toMatch(/api\.post\(row\.restore\.path\)/);
    expect(page).toMatch(/Restore the \{r\.blockedBy\?\.parent/);
    expect(page).toMatch(/disabled=\{!r\.canRestore/);
  });

  it('formats a missing time as a dash', () => {
    expect(formatWhen(null)).toBe('—');
    expect(formatWhen('not a date')).toBe('—');
  });
});
