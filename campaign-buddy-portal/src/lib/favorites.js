// Favorite menu pages — pure helpers behind the sidebar stars and the
// Personalization page. The list itself is stored per account under the
// `menu.favorites` preference (backend: utils/userPreferences.ts), as route
// paths. Paths, not labels, so a rename or move in nav.js doesn't lose them.

export const FAVORITES_KEY = 'menu.favorites';
export const MAX_FAVORITES = 12; // keep in step with the backend limit

// Every page in the sidebar this persona can open, in menu order, one entry per
// path (the first menu slot wins, matching what the sidebar highlights).
export function navEntriesFor(nav, persona) {
  const seen = new Set();
  const out = [];
  const add = (path, label, icon, parent, section) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    out.push({ path, label, icon, parent, section });
  };
  for (const sec of nav) {
    if (sec.roles && !sec.roles.includes(persona)) continue;
    for (const item of sec.items) {
      if (!item.roles.includes(persona)) continue;
      if (item.children) {
        for (const c of item.children) add(c.path, c.label, item.icon, item.label, sec.section);
      } else {
        add(item.path, item.label, item.icon, null, sec.section);
      }
    }
  }
  return out;
}

// Saved paths → nav entries, in the user's order. Paths this persona can't
// reach (role changed, page retired) are skipped rather than shown broken.
export function resolveFavorites(paths, entries) {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return (paths || []).map((p) => byPath.get(p)).filter(Boolean);
}

export function toggleFavorite(paths, path) {
  const list = paths || [];
  if (list.includes(path)) return { paths: list.filter((p) => p !== path), limitReached: false };
  if (list.length >= MAX_FAVORITES) return { paths: list, limitReached: true };
  return { paths: [...list, path], limitReached: false };
}

export function moveFavorite(paths, path, delta) {
  const list = [...(paths || [])];
  const from = list.indexOf(path);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= list.length) return list;
  [list[from], list[to]] = [list[to], list[from]];
  return list;
}

// Sidebar/settings text for a favorite. Child pages have generic names ("List",
// "Attendance") so they carry their group: "Staff › Attendance".
export function entryLabel(entry) {
  return entry.parent ? `${entry.parent} › ${entry.label}` : entry.label;
}
