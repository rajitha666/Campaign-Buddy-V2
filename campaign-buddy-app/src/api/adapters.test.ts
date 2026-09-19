import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The api adapters are thin wrappers over `apiClient`. Mock it so we can assert
 * each one hits the right `/v1` path/verb and unwraps the `{ data: ... }`
 * envelope — without pulling in axios, Expo SecureStore, or a network.
 */
const calls: Array<{ method: string; path: string; body?: unknown; params?: unknown }> = [];
vi.mock('./client', () => {
  const rec =
    (method: string) =>
    (path: string, a?: unknown, b?: unknown) => {
      const isWrite = method === 'post' || method === 'patch';
      calls.push({
        method,
        path,
        body: isWrite ? a : undefined,
        params: (isWrite ? (b as any) : (a as any))?.params,
      });
      return Promise.resolve({ data: { data: { ok: true, echoed: isWrite ? a : undefined } } });
    };
  return { apiClient: { get: rec('get'), post: rec('post'), patch: rec('patch') } };
});

// vi.mock is hoisted above these imports, so the mocked './client' is in place.
import * as auth from './auth';
import * as profile from './profile';
import * as stats from './stats';
import * as attendance from './attendance';
import * as products from './products';
import * as salesSummary from './salesSummary';
import * as supervisorRoute from './supervisorRoute';

beforeEach(() => {
  calls.length = 0;
});

describe('api adapters — path + verb', () => {
  it('auth', async () => {
    await auth.login('u', 'p');
    await auth.forgotPassword('u');
    await auth.refreshAccessToken('rt');
    await auth.logout();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'post /auth/login',
      'post /auth/forgot-password',
      'post /auth/refresh',
      'post /auth/logout',
    ]);
    expect(calls[0].body).toEqual({ username: 'u', password: 'p' });
  });

  it('profile + stats unwrap the data envelope', async () => {
    const me = await profile.getMe();
    expect(me).toEqual({ ok: true, echoed: undefined });
    await profile.getTodayAssignment();
    await stats.getTodayStats();
    await stats.updateTodayStats({ footFall: 13 });
    await stats.getStatsRange('2026-09-05', '2026-09-11');
    await stats.getLast7Days();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /me',
      'get /me/assignments/today',
      'get /stats/today',
      'patch /stats/today',
      'get /stats/range',
      'get /stats/range',
    ]);
    expect(calls[3].body).toEqual({ footFall: 13 });
    expect(calls[4].params).toEqual({ dateFrom: '2026-09-05', dateTo: '2026-09-11' });
    expect((calls[5].params as { dateTo: string }).dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('attendance check-in posts the geo payload', async () => {
    await attendance.getAttendanceToday();
    await attendance.checkIn({
      assignmentId: 'a1',
      latitude: 1,
      longitude: 2,
      timestamp: '2026-09-06T09:00:00.000Z',
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /attendance/today',
      'post /attendance/check-in',
    ]);
    expect(calls[1].body).toMatchObject({ assignmentId: 'a1', latitude: 1, longitude: 2 });
  });

  it('attendance check-out forwards the assignmentId when one is given', async () => {
    await attendance.checkOut({
      assignmentId: 'a1',
      latitude: 1,
      longitude: 2,
      timestamp: '2026-09-06T17:00:00.000Z',
      salesSummaryConfirmed: true,
    });
    await attendance.checkOut({ timestamp: '2026-09-06T17:00:00.000Z', salesSummaryConfirmed: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'post /attendance/check-out',
      'post /attendance/check-out',
    ]);
    expect(calls[0].body).toMatchObject({ assignmentId: 'a1' });
    expect((calls[1].body as Record<string, unknown>).assignmentId).toBeUndefined();
  });

  it('products nests campaign + outlet ids and targets the assignment id for stock', async () => {
    await products.getCampaignProducts('camp1', 'out1', { reorderOnly: true });
    await products.getProductDetails('prod1');
    await products.updateStock('cpa1', { openingStock: 50 } as any);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /campaigns/camp1/outlets/out1/products',
      'get /products/prod1',
      'patch /products/cpa1/stock',
    ]);
    expect(calls[0].params).toEqual({ reorderOnly: true });
  });
});

// Multi-outlet promoters: the stats + sales-summary endpoints accept an
// ?assignmentId= query param so the app targets the chosen outlet instead of
// the server's findFirst pick (backend matches /attendance/today's param, #me/assignments selected).
describe('api adapters — assignmentId targeting for multi-outlet promoters', () => {
  it('stats forwards assignmentId as a query param (read + write)', async () => {
    await stats.getTodayStats('a2');
    await stats.updateTodayStats({ footFall: 3 }, 'a2');
    expect(calls.map((c) => `${c.method} ${c.path} ${JSON.stringify(c.params) ?? ''}`)).toEqual([
      'get /stats/today {"assignmentId":"a2"}',
      'patch /stats/today {"assignmentId":"a2"}',
    ]);
    expect(calls[1].body).toEqual({ footFall: 3 }); // assignmentId must not leak into the body
  });

  it('stats omit the param entirely for the single-assignment promoters', async () => {
    await stats.getTodayStats();
    await stats.updateTodayStats({ footFall: 1 });
    expect(calls[0].params).toBeUndefined();
    expect(calls[1].params).toBeUndefined();
  });

  it('sales-summary read, update and confirm forward assignmentId as a query param', async () => {
    await salesSummary.getTodaySalesSummary('a2');
    await salesSummary.updateSalesSummary({ remarks: 'r' }, 'a2');
    await salesSummary.confirmSalesSummary({ remarks: 'r' }, 'a2');
    expect(calls.map((c) => `${c.method} ${c.path} ${JSON.stringify(c.params) ?? ''}`)).toEqual([
      'get /sales-summary/today {"assignmentId":"a2"}',
      'patch /sales-summary/today {"assignmentId":"a2"}',
      'post /sales-summary/today/confirm {"assignmentId":"a2"}',
    ]);
    for (const c of calls.slice(1)) {
      expect((c.body as Record<string, unknown>).assignmentId).toBeUndefined();
    }
  });

  it('supervisor-mode /me/assignments list doubles as the promoter assignment picker source', async () => {
    await supervisorRoute.getMyAssignments();
    await supervisorRoute.getMyAssignments('2026-09-19');
    expect(calls.map((c) => `${c.method} ${c.path} ${JSON.stringify(c.params) ?? ''}`)).toEqual([
      'get /me/assignments ',
      'get /me/assignments {"date":"2026-09-19"}',
    ]);
  });
});
