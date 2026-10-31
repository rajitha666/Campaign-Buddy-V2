// Grouped menu items (`children` in config/nav.js) are one sidebar row; their
// children are the tabs shown at the top of each page in the group.

export const itemPath = (item) => item.path || item.children?.[0]?.path;

export const itemIsActive = (item, pathname) =>
  item.path === pathname || !!item.children?.some((c) => c.path === pathname);

// The group `pathname` belongs to for this persona: { group, tabs } or null.
export function tabsFor(nav, persona, pathname) {
  for (const sec of nav) {
    if (sec.roles && !sec.roles.includes(persona)) continue;
    for (const item of sec.items) {
      if (!item.roles.includes(persona) || !item.children) continue;
      if (item.children.some((c) => c.path === pathname)) return { group: item.label, tabs: item.children };
    }
  }
  return null;
}
