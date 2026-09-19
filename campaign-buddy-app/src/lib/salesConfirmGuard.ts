/**
 * Confirm & submit on the Daily sales screen. A quiet day is still a day: with
 * foot fall or approached at 0 the rep can still confirm (the backend allows it),
 * but the screen flags it as a `zeroDay` so they acknowledge it first — that
 * guards against simply forgetting to log the counts.
 */
export interface SalesConfirmState {
  confirmed: boolean;
  checkedIn: boolean;
  footFall: number;
  approached: number;
}

export function canConfirmSales(s: SalesConfirmState): { ok: boolean; zeroDay: boolean } {
  const zeroDay = !s.confirmed && (s.footFall <= 0 || s.approached <= 0);
  return { ok: !s.confirmed && s.checkedIn, zeroDay };
}
