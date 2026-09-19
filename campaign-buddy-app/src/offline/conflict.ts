/**
 * Detecting an offline edit that would silently overwrite a change made
 * elsewhere (typically head office correcting the day's numbers in the portal
 * while the promoter had no signal). Every write here sends an absolute value,
 * so without this the promoter's older number would just win.
 *
 * At enqueue time we remember what the edited fields held (`base`); before
 * sending, we compare with the server. A field only conflicts if the server
 * moved off `base` AND doesn't already equal what we're about to send.
 */
import type { QueueKind } from './types';

export interface ConflictField {
  field: string;
  base: unknown;
  server: unknown;
  mine: unknown;
}

const TRACKED: Partial<Record<QueueKind, string[]>> = {
  stats: ['footFall', 'approached', 'converted'],
  productStock: ['openingStock', 'soldToday', 'otherInterestedCustomers', 'reorderFlag'],
};

const LABELS: Record<string, string> = {
  footFall: 'Foot fall',
  approached: 'Approached',
  converted: 'Converted',
  openingStock: 'Opening stock',
  soldToday: 'Sold today',
  otherInterestedCustomers: 'Other interested customers',
  reorderFlag: 'Flag for reorder',
};

type Bag = Record<string, unknown>;

export function pickBase(kind: QueueKind, payload: unknown, current: unknown): Bag | undefined {
  const fields = TRACKED[kind];
  if (!fields || !current) return undefined;
  const out: Bag = {};
  for (const f of fields) {
    if ((payload as Bag)[f] !== undefined && (current as Bag)[f] !== undefined) out[f] = (current as Bag)[f];
  }
  return Object.keys(out).length ? out : undefined;
}

export function detectConflict(kind: QueueKind, payload: unknown, base: unknown, server: unknown): ConflictField[] {
  const fields = TRACKED[kind];
  if (!fields || !base || !server) return [];
  const out: ConflictField[] = [];
  for (const f of fields) {
    const mine = (payload as Bag)[f];
    if (mine === undefined || !(f in (base as Bag))) continue;
    const theirs = (server as Bag)[f];
    if (theirs !== (base as Bag)[f] && theirs !== mine) out.push({ field: f, base: (base as Bag)[f], server: theirs, mine });
  }
  return out;
}

export const describeConflict = (fields: ConflictField[]) =>
  fields.map((c) => `${LABELS[c.field] ?? c.field}: office has ${String(c.server)}, you entered ${String(c.mine)}`).join('; ');
