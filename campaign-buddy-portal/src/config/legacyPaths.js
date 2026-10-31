// Pages retired by the navigation clean-up (#116) and where each persona is sent
// instead, so old bookmarks, guides and saved favorites keep working. A plain
// string applies to everyone; an object is per persona (sponsors still use
// /sponsor/sales and /reports/client-brand-wise as their own report pages).
export const LEGACY_REDIRECTS = {
  '/sales': '/dashboard', // the Dashboard shows the same cards and chart
  '/outlet-attendance': '/supervisor-attendance', // same query as Supervisors > Attendance
  '/promoter-list': '/staff', // read-only subset of Staff
  '/sponsor/sales': { admin: '/sales/sku-wise' }, // same page as Sales Reports > SKU Wise
  '/reports/client-brand-wise': { admin: '/reports/brand-wise' }, // same API and filters as Brand Wise
};

// Where `path` should go for `persona`, or null when it is a live page.
export function redirectFor(path, persona) {
  const r = LEGACY_REDIRECTS[path];
  if (!r) return null;
  return typeof r === 'string' ? r : (r[persona] || null);
}
