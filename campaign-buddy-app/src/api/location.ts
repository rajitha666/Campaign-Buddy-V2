// Spec §5 — POST /location/ping
//
// IMPORTANT: this must only be called while the rep is checked in. The
// backend enforces this too (422 NOT_CHECKED_IN), but the client should
// never even attempt it outside a shift — see useLocationTracking.ts, which
// is the ONLY place this function should be called from.
import { apiClient } from './client';
import type { LocationPingRequest } from './types';

export async function sendLocationPing(payload: LocationPingRequest): Promise<void> {
  await apiClient.post('/location/ping', payload);
}
