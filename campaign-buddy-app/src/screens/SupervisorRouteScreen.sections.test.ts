import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #69 pinned: the planned route section must render ABOVE the Today's visits
// (check-in) section on My Route, so the supervisor sees their itinerary first.
describe('SupervisorRouteScreen section order', () => {
  const source = readFileSync(join(__dirname, 'SupervisorRouteScreen.tsx'), 'utf8');

  it('renders Planned route before Today’s visits', () => {
    expect(source.indexOf('>Planned route</Text>')).toBeGreaterThan(-1);
    expect(source.indexOf(">Today's visits</Text>")).toBeGreaterThan(-1);
    expect(source.indexOf('>Planned route</Text>')).toBeLessThan(source.indexOf(">Today's visits</Text>"));
  });

  // Check-in success must land straight on the outlet's checklist: the
  // handleCheckIn success path navigates to SupervisorChecklist (before the
  // alert handling/finally).
  it('navigates to the outlet checklist after a successful check-in', () => {
    const successBlock = source.slice(
      source.indexOf('await checkIn(assignment.assignmentId)'),
      source.indexOf("showAlert('Could not check in'")
    );
    expect(successBlock).toContain("navigation.navigate('SupervisorChecklist'");
    expect(successBlock).toContain('assignmentId: assignment.assignmentId');
    expect(successBlock).toContain('outletName: assignment.outlet.name');
    expect(successBlock).toContain('campaignName: assignment.campaign.name');
  });
});
