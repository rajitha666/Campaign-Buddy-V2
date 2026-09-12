// Supervisor mode — docs/api-spec.md §4 GET /me/assignments, GET /me/supervisor-routes
import { apiClient } from './client';
import type { SupervisorAssignment, SupervisorRoute } from './types';

/** Every outlet Activation open on `date` (defaults to today) — a supervisor can have several. */
export async function getMyAssignments(date?: string): Promise<SupervisorAssignment[]> {
  const { data } = await apiClient.get<{ data: SupervisorAssignment[] }>('/me/assignments', {
    params: date ? { date } : undefined,
  });
  return data.data;
}

/** Read-only planned itinerary — never drives check-in eligibility, see /me/assignments for that. */
export async function getMyRoutes(): Promise<SupervisorRoute[]> {
  const { data } = await apiClient.get<{ data: SupervisorRoute[] }>('/me/supervisor-routes');
  return data.data;
}
