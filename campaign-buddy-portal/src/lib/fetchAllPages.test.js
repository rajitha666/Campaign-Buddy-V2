import { describe, it, expect } from 'vitest';
import { fetchAllPages } from './fetchAllPages';

// Regression (#93): the admin list endpoints default to 25 rows (max 200), so
// the Dashboard's yesterday/today/week figures were computed from a truncated
// first page. fetchAllPages keeps requesting pages until meta.total is covered.
function fakeEndpoint(total, pageCap = 200) {
  const calls = [];
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const fn = async (query) => {
    calls.push(query);
    const size = Math.min(query.pageSize, pageCap);
    const start = (query.page - 1) * size;
    return { data: rows.slice(start, start + size), meta: { total } };
  };
  return { fn, calls };
}

describe('fetchAllPages', () => {
  it('walks every page and returns all rows', async () => {
    const { fn, calls } = fakeEndpoint(450);
    const rows = await fetchAllPages(fn, { dateFrom: '2026-09-01' });
    expect(rows).toHaveLength(450);
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(calls[0]).toMatchObject({ dateFrom: '2026-09-01', pageSize: 200 });
  });

  it('makes a single request when everything fits on one page', async () => {
    const { fn, calls } = fakeEndpoint(12);
    expect(await fetchAllPages(fn)).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });

  it('stops on an empty page even if meta.total overstates', async () => {
    const fn = async (q) => ({ data: q.page === 1 ? [{ id: 1 }] : [], meta: { total: 999 } });
    expect(await fetchAllPages(fn)).toHaveLength(1);
  });
});
