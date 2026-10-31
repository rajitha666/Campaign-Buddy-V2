import { NAV } from '../config/nav';

// Page title + breadcrumb for a route, from the sidebar config. Shared by the
// topbar heading and the browser tab title so they never disagree.
export function findLabel(pathname) {
  if (pathname === '/personalization') return { title: 'Personalization', crumb: 'Account' };
  for (const sec of NAV) {
    for (const item of sec.items) {
      if (item.path === pathname) return { title: item.label, crumb: sec.section || 'Home' };
      if (item.children) {
        for (const c of item.children) {
          if (c.path === pathname) return { title: c.label, crumb: item.label };
        }
      }
    }
  }
  return { title: 'Campaign Buddy', crumb: 'Portal' };
}

// "Staff · Attendance — Campaign Buddy". Falls back to the bare product name.
export function documentTitle(pathname) {
  const { title, crumb } = findLabel(pathname);
  if (title === 'Campaign Buddy') return 'Campaign Buddy';
  const section = crumb && crumb !== 'Home' && crumb !== 'Portal' ? `${crumb} · ` : '';
  return `${section}${title} — Campaign Buddy`;
}
