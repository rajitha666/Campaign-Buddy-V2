/**
 * Confirm & submit on the Daily sales screen needs today's foot fall and
 * approached counts logged (> 0) first — the backend enforces this on
 * POST /sales-summary/today/confirm (STATS_REQUIRED); this mirrors it so the
 * app disables the button up front and says why, instead of a failed call.
 */
export interface SalesConfirmState {
  confirmed: boolean;
  checkedIn: boolean;
  footFall: number;
  approached: number;
}

export function canConfirmSales(s: SalesConfirmState): { ok: boolean; statsMissing: boolean } {
  const statsMissing = !s.confirmed && (s.footFall <= 0 || s.approached <= 0);
  return { ok: !s.confirmed && s.checkedIn && !statsMissing, statsMissing };
}
