// Alphabetical ordering shared by every dropdown in the portal (client doc D,
// #67) — locale-aware and case-insensitive so "aisle" and "Aisle" land next
// to each other instead of splitting on case. `keyFn` lets the same helper
// sort {value,label} option lists and raw API rows (e.g. campaigns by name).
export function sortOptions(items, keyFn = (o) => o.label) {
  return [...(items || [])].sort((a, b) =>
    String(keyFn(a) ?? '').localeCompare(String(keyFn(b) ?? ''), undefined, { sensitivity: 'base' })
  );
}

// Same alphabetical sort, but a blank-value sentinel — the "All …" option a
// filter prepends (FilterBar's `allLabel`) — stays pinned first instead of
// sorting wherever its label happens to land (client doc E).
export function sortOptionsWithAllFirst(options) {
  const allOption = (options || []).find((o) => o.value === '');
  const rest = sortOptions((options || []).filter((o) => o.value !== ''));
  return allOption ? [allOption, ...rest] : rest;
}
