import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the path/query every endpoint helper hits, without a real network.
const calls = [];
vi.mock('./apiClient', () => {
  const rec = (method) => (path, a, b) => {
    // get/delete: (path, {query}); post/patch: (path, body, {query})
    const opts = method === 'post' || method === 'patch' ? b : a;
    calls.push({ method, path, query: opts?.query, body: method === 'post' || method === 'patch' ? a : undefined });
    return Promise.resolve({ data: [] });
  };
  return {
    api: { get: rec('get'), post: rec('post'), patch: rec('patch'), delete: rec('delete'), postForm: rec('postForm') },
    ApiError: class ApiError extends Error {},
  };
});

const api = await import('./endpoints');

beforeEach(() => { calls.length = 0; });

describe('endpoints — path construction', () => {
  it('catalog CRUD hits the right verbs + paths', async () => {
    await api.clients.list({ page: 1 });
    await api.clients.create({ clientName: 'X' });
    await api.clients.update('c1', { clientName: 'Y' });
    await api.clients.remove('c1');
    expect(calls).toEqual([
      { method: 'get', path: '/clients', query: { page: 1 }, body: undefined },
      { method: 'post', path: '/clients', query: undefined, body: { clientName: 'X' } },
      { method: 'patch', path: '/clients/c1', query: undefined, body: { clientName: 'Y' } },
      { method: 'delete', path: '/clients/c1', query: undefined, body: undefined },
    ]);
  });

  it('campaign-scoped endpoints nest the campaignId', async () => {
    await api.activations.list('camp1', { page: 1 });
    await api.activations.items('camp1', 'act1');
    await api.supervisorRoutes.create('camp1', { supervisorStaffId: 's' });
    await api.salesLookup.load('camp1', { date: '2026-09-06' });
    await api.reports.outletWise('camp1', {});
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /campaigns/camp1/activations',
      'get /campaigns/camp1/activations/act1/items',
      'post /campaigns/camp1/supervisor-routes',
      'get /campaigns/camp1/sales/lookup',
      'get /campaigns/camp1/reports/outlet-wise',
    ]);
  });

  it('license usage endpoints hit the campaign-scoped + account-wide routes', async () => {
    await api.license.get('camp1');
    await api.license.update('camp1', { promoterCap: 25 });
    await api.license.history('camp1', { period: 'week' });
    await api.license.usage({ state: 'over' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /campaigns/camp1/license',
      'patch /campaigns/camp1/license',
      'get /campaigns/camp1/license/history',
      'get /license/usage',
    ]);
  });

  it('issue-report endpoints hit /issue-reports', async () => {
    await api.issueReports.list({ limit: 100 });
    await api.issueReports.create({ title: 'x', body: 'y', category: 'bug' });
    await api.issueReports.retry('r1');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /issue-reports',
      'post /issue-reports',
      'post /issue-reports/r1/retry',
    ]);
  });

  it('client-scoped report shims point at the plain /reports/* routes (v3 §5.10)', async () => {
    await api.assumed.clientScopedReports.skuWise('camp1', {});
    await api.assumed.clientScopedReports.brandWise('camp1', {});
    expect(calls.map((c) => c.path)).toEqual([
      '/campaigns/camp1/reports/sku-wise',
      '/campaigns/camp1/reports/brand-wise',
    ]);
  });

  it('assumed.* compat shims resolve to real functions', async () => {
    await api.assumed.staffProfileEvaluation('s1', {});
    await api.assumed.updateSalesLoad('camp1', { date: 'd' });
    await api.assumed.assignedRoutes.list('camp1', {});
    expect(calls.map((c) => c.path)).toEqual([
      '/staff/s1/evaluation',
      '/campaigns/camp1/sales/lookup',
      '/campaigns/camp1/supervisor-routes',
    ]);
  });
});
