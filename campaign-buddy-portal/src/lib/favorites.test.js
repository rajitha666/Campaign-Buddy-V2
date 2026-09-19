import { describe, it, expect } from 'vitest';
import { NAV } from '../config/nav';
import { MAX_FAVORITES, navEntriesFor, resolveFavorites, toggleFavorite, moveFavorite, entryLabel } from './favorites';

const admin = navEntriesFor(NAV, 'admin');
const supervisor = navEntriesFor(NAV, 'supervisor');

describe('navEntriesFor', () => {
  it('lists every page the persona can reach, once, with its group and icon', () => {
    const sku = admin.find((e) => e.path === '/sales/sku-wise');
    expect(sku).toMatchObject({ label: 'SKU Wise Sales', parent: 'Sales Overview', icon: 'sales' });
    const paths = admin.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('respects persona visibility', () => {
    expect(admin.some((e) => e.path === '/clients')).toBe(true);
    expect(supervisor.some((e) => e.path === '/clients')).toBe(false);
    expect(supervisor.some((e) => e.path === '/my-outlet-attendance')).toBe(true);
  });
});

describe('resolveFavorites', () => {
  it('keeps the saved order and drops pages the persona no longer has', () => {
    const out = resolveFavorites(['/tracking/live', '/gone', '/clients'], supervisor);
    expect(out.map((e) => e.path)).toEqual(['/tracking/live']);
    expect(resolveFavorites(['/tracking/live', '/clients'], admin).map((e) => e.path)).toEqual(['/tracking/live', '/clients']);
  });
});

describe('toggleFavorite', () => {
  it('adds to the end and removes on a second toggle', () => {
    expect(toggleFavorite(['/a'], '/b').paths).toEqual(['/a', '/b']);
    expect(toggleFavorite(['/a', '/b'], '/a').paths).toEqual(['/b']);
  });

  it('refuses to go past the limit but still lets you remove', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => `/p${i}`);
    const res = toggleFavorite(full, '/extra');
    expect(res.limitReached).toBe(true);
    expect(res.paths).toEqual(full);
    expect(toggleFavorite(full, '/p0').paths).toHaveLength(MAX_FAVORITES - 1);
  });
});

describe('moveFavorite', () => {
  it('moves up/down and stops at the ends', () => {
    expect(moveFavorite(['/a', '/b', '/c'], '/c', -1)).toEqual(['/a', '/c', '/b']);
    expect(moveFavorite(['/a', '/b', '/c'], '/a', -1)).toEqual(['/a', '/b', '/c']);
    expect(moveFavorite(['/a', '/b', '/c'], '/c', 1)).toEqual(['/a', '/b', '/c']);
    expect(moveFavorite(['/a', '/b'], '/zzz', 1)).toEqual(['/a', '/b']);
  });
});

describe('entryLabel', () => {
  it('prefixes child pages with their group', () => {
    expect(entryLabel({ label: 'Attendance', parent: 'Staff' })).toBe('Staff › Attendance');
    expect(entryLabel({ label: 'Clients', parent: null })).toBe('Clients');
  });
});
