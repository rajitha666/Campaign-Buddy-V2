import type { ConflictField } from './conflict';

/** Kinds are also the send order: check-in first, check-out last (see queue.ts RANK). */
export type QueueKind = 'checkIn' | 'stats' | 'salesSummary' | 'productStock' | 'salesConfirm' | 'checkOut';

/**
 * pending  — waiting to be sent (retried automatically).
 * failed   — the server refused it (not a network problem); needs the rep's attention.
 * conflict — the server's numbers changed while the rep was offline; needs the rep's decision.
 */
export type QueueStatus = 'pending' | 'failed' | 'conflict';

export interface QueuedMutation<T = unknown> {
  id: string;
  kind: QueueKind;
  /** Identifies the record being written — 'today' for day-level writes, the campaignProductAssignmentId for stock. */
  key: string;
  payload: T;
  /** When the FIRST edit of this record was queued (drives conflict-check age). */
  createdAt: string;
  /** When the LATEST edit was made — sent as `capturedAt` so the server can place it inside the shift. */
  updatedAt: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  /** What the edited fields held on the server before the first offline edit — for conflict detection. */
  base?: Record<string, unknown>;
  conflict?: ConflictField[];
}
