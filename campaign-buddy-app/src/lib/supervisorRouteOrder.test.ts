import { describe, expect, it } from 'vitest';
import { sortVisitsByRoute } from './supervisorRouteOrder';
import type { SupervisorAssignment, SupervisorRoute } from '@/api/types';

const visit = (id: string, outletId: string): { assignment: SupervisorAssignment } => ({
  assignment: {
    assignmentId: id,
    campaign: { id: 'c1', name: 'Radiance Q3 Push', startDate: '2026-09-18' },
    outlet: { id: outletId, name: outletId, address: '', latitude: 0, longitude: 0, geofenceRadiusMeters: 0 },
    shiftStart: null,
    shiftEnd: null,
  },
});

const route = (outletIds: string[]): SupervisorRoute => ({
  id: 'r1',
  campaign: { id: 'c1', name: 'Radiance Q3 Push' },
  outlets: outletIds.map((id) => ({ id, name: id, address: '' })),
  dateFrom: '2026-09-18',
  dateTo: '2026-09-19',
});

describe('sortVisitsByRoute', () => {
  it('orders visits by the planned route outlet sequence', () => {
    const visits = [visit('a', 'out3'), visit('b', 'out1'), visit('c', 'out2')];
    const sorted = sortVisitsByRoute(visits, [route(['out1', 'out2', 'out3'])]);
    expect(sorted.map((v) => v.assignment.assignmentId)).toEqual(['b', 'c', 'a']);
  });

  it('visits with no matching route outlet keep relative order at the end', () => {
    const visits = [visit('a', 'out2'), visit('b', 'off-route'), visit('c', 'out1'), visit('d', 'other')];
    const sorted = sortVisitsByRoute(visits, [route(['out1', 'out2'])]);
    expect(sorted.map((v) => v.assignment.assignmentId)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('is a display-only sort: the input list is left untouched', () => {
    const visits = [visit('a', 'out2'), visit('b', 'out1')];
    sortVisitsByRoute(visits, [route(['out1', 'out2'])]);
    expect(visits.map((v) => v.assignment.assignmentId)).toEqual(['a', 'b']);
  });
});
