// Accept the same two option shapes the rest of the portal does — plain
// strings (hardcoded lists like supervisor-task categories, provinces) and
// {value,label} objects — so SearchableSelect renders both. Same `??` fallback
// convention as the <select>/radio renderers in Drawer.jsx.
export function normalizeOptions(options) {
  return (options || []).map((o) => (typeof o === 'string'
    ? { value: o, label: o }
    : o));
}

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
  return sortOptionsWithAllFirstNormalized(normalizeOptions(options));
}

export function sortOptionsWithAllFirstNormalized(options) {
  const allOption = options.find((o) => o.value === '');
  const rest = sortOptions(options.filter((o) => o.value !== ''));
  return allOption ? [allOption, ...rest] : rest;
}
