/**
 * One sync pass — queued writes, then buffered location pings — with no React
 * in it, so the same code runs in the foreground (SyncContext) and in the
 * background task (backgroundSync.ts).
 */
import * as attendanceApi from '@/api/attendance';
import * as statsApi from '@/api/stats';
import * as salesSummaryApi from '@/api/salesSummary';
import * as productsApi from '@/api/products';
import * as profileApi from '@/api/profile';
import { sendLocationPing } from '@/api/location';
import { detectConflict, type ConflictField } from './conflict';
import { flushPings, type FlushResult } from './pingBuffer';
import * as queue from './queue';
import type { QueuedMutation } from './types';

/** Edits younger than this were made online and sent straight away — nothing to compare. */
const CONFLICT_CHECK_MIN_AGE_MS = 60_000;

const sendPings = () => flushPings((p) => sendLocationPing(p));

// Multi-outlet promoters: a queued write's `assignmentId` chooses which
// outlet's activation the send targets — query param, never in the body.
function targeted<T>(payload: unknown): { body: T; assignmentId?: string } {
  const { assignmentId, ...body } = (payload ?? {}) as T & { assignmentId?: string };
  return { body: body as T, assignmentId };
}

export const syncHandlers: queue.SyncHandlers = {
  checkIn: async (_key, payload) => {
    const p = payload as { assignmentId: string; latitude: number; longitude: number; capturedAt: string };
    await attendanceApi.checkIn({ ...p, timestamp: p.capturedAt });
  },
  // Each write says when the edit was really made: if the shift has closed by the time it
  // arrives (own check-out, end-of-day auto-checkout) the server still accepts it when that
  // moment falls inside the shift. While the shift is open it is ignored.
  stats: async (_key, payload, item) => {
    const { body, assignmentId } = targeted<statsApi.StatsUpdateRequest>(payload);
    await statsApi.updateTodayStats({ ...body, capturedAt: item.updatedAt }, assignmentId);
  },
  salesSummary: async (_key, payload, item) => {
    const { body, assignmentId } = targeted<Parameters<typeof salesSummaryApi.updateSalesSummary>[0]>(payload);
    await salesSummaryApi.updateSalesSummary({ ...body, capturedAt: item.updatedAt }, assignmentId);
  },
  productStock: async (key, payload, item) => {
    await productsApi.updateStock(key, { ...(payload as Parameters<typeof productsApi.updateStock>[1]), capturedAt: item.updatedAt });
  },
  salesConfirm: async (_key, payload, item) => {
    const { body, assignmentId } = targeted<Parameters<typeof salesSummaryApi.confirmSalesSummary>[0]>(payload);
    await salesSummaryApi.confirmSalesSummary({ ...body, capturedAt: item.updatedAt }, assignmentId);
  },
  checkOut: async (_key, payload) => {
    // Pings must reach the server while the shift is still open.
    await sendPings().catch(() => {});
    const p = payload as attendanceApi.CheckOutRequest;
    await attendanceApi.checkOut({ ...p, timestamp: p.capturedAt ?? p.timestamp });
  },
};

export async function checkConflict(item: QueuedMutation): Promise<ConflictField[] | null> {
  if (Date.now() - Date.parse(item.createdAt) < CONFLICT_CHECK_MIN_AGE_MS) return null;
  let server: unknown;
  if (item.kind === 'stats') {
    server = await statsApi.getTodayStats(targeted<statsApi.StatsUpdateRequest>(item.payload).assignmentId);
  } else if (item.kind === 'productStock') {
    const a = await profileApi.getTodayAssignment();
    const products = await productsApi.getCampaignProducts(a.campaign.id, a.outlet.id);
    server = products.find((p) => p.campaignProductAssignmentId === item.key);
  } else {
    return null;
  }
  return detectConflict(item.kind, item.payload, item.base, server);
}

export interface SyncPass {
  drain: queue.DrainResult;
  pings: FlushResult | null;
}

export async function runSync(): Promise<SyncPass> {
  const drain = await queue.drain(syncHandlers, { checkConflict });
  // Once the queue is through (check-in is on the server), upload the trail recorded offline.
  const pings = drain.stopped === null ? await sendPings().catch(() => null) : null;
  return { drain, pings };
}
