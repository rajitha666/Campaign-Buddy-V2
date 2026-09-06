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
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /me',
      'get /me/assignments/today',
      'get /stats/today',
      'patch /stats/today',
    ]);
    expect(calls[3].body).toEqual({ footFall: 13 });
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
