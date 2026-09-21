// The admin list endpoints page server-side (default 25 rows, hard cap 200), so
// a single call silently truncates. Use this when a page aggregates client-side
// and needs every row: it requests 200-row pages until meta.total is covered.
const PAGE_SIZE = 200;

export async function fetchAllPages(listFn, query = {}) {
  const rows = [];
  for (let page = 1; ; page++) {
    const res = await listFn({ ...query, page, pageSize: PAGE_SIZE });
    const batch = res?.data || [];
    rows.push(...batch);
    const total = res?.meta?.total ?? rows.length;
    if (batch.length === 0 || rows.length >= total) return rows;
  }
}
