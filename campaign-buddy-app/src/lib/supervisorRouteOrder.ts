import type { SupervisorAssignment, SupervisorRoute } from '@/api/types';

/**
 * Orders "Today's visits" to match the supervisor's planned route: the
 * SupervisorRoute itinerary is the order the supervisor drives, so the
 * check-in list follows it. Display-order only — it never touches check-in
 * eligibility (Backend Spec v3 §5.9 / docs/api-spec.md §4).
 *
 * Visits whose outlet isn't on any route (or routes with no visit today) keep
 * their relative order; route-less visits are appended at the end.
 */
export type VisitRowData = { assignment: SupervisorAssignment };

export function sortVisitsByRoute<T extends VisitRowData>(
  visits: T[],
  routes: SupervisorRoute[]
): T[] {
  const rank = new Map<string, number>();
  for (const route of routes) {
    for (const outlet of route.outlets) {
      if (!rank.has(outlet.id)) rank.set(outlet.id, rank.size);
    }
  }
  return visits
    .map((visit, order) => ({
      visit,
      order,
      routeRank: rank.get(visit.assignment.outlet.id) ?? Infinity,
    }))
    .sort((a, b) => a.routeRank - b.routeRank || a.order - b.order)
    .map((entry) => entry.visit);
}
