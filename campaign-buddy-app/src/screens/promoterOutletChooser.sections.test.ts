import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Multi-outlet promoters: a promoter can hold two same-day Activations, so the
// app must let them CHOOSE which outlet is live (the old /today flow silently
// showed only the server's findFirst pick). Home leads the picker and every
// scoped screen (Attendance check-in/out, Stats update, Sales confirm,
// Products, Performance) reads the same chosen assignment — one outlet at a
// time under the one-open-shift lock.
// Source files are checked out with CRLF on Windows; the multi-line expectations below use LF.
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('promoter outlet chooser wiring', () => {
  const context = read(join(__dirname, '..', 'context', 'AssignmentContext.tsx'));
  const home = read(join(__dirname, 'HomeScreen.tsx'));
  const attendance = read(join(__dirname, 'AttendanceScreen.tsx'));
  const stats = read(join(__dirname, 'StatsUpdateScreen.tsx'));
  const summary = read(join(__dirname, 'SalesSummaryScreen.tsx'));
  const products = read(join(__dirname, 'ProductsScreen.tsx'));
  const performance = read(join(__dirname, 'PerformanceScreen.tsx'));

  it('the provider sources the list from /me/assignments and falls back to /today', () => {
    expect(context).toContain("queryFn: offlineQueries.getMyAssignments");
    expect(context).toContain("queryFn: offlineQueries.getTodayAssignment");
    expect(context).toContain('hasMultiple: assignments.length > 1');
  });

  it('Home renders the outlet chips and everything is keyed by the chosen assignment', () => {
    expect(home.indexOf('hasMultiple && assignment')).toBeGreaterThan(-1);
    expect(home).toContain('select(a.assignmentId)');
    expect(home).toContain('getTodayStats(assignment!.assignmentId)');
    expect(home).toContain('offlineQueries.getCampaignProducts(\n        assignment!.campaign.id,\n        assignment!.outlet.id\n      )');
  });

  it('Attendance checks in/out against the chosen assignment', () => {
    expect(attendance).toContain('await checkIn(assignment.assignmentId)');
    // check-out closes the OPEN shift's outlet, which may differ from the outlet being viewed
    expect(attendance).toContain('assignmentId={openAssignmentId ?? assignment?.assignmentId}');
    expect(attendance.indexOf('hasMultiple && assignment')).toBeGreaterThan(-1);
  });

  it('Stats update and sales confirm carry the chosen assignmentId', () => {
    expect(stats).toContain("save('stats', assignmentId!");
    expect(stats).toContain('assignmentId,');
    expect(summary).toContain("save('salesConfirm', assignmentId!");
    expect(summary).toContain('assignmentId,');
  });

  it('Products and Performance scope to the chosen assignment', () => {
    expect(products).toContain('useAssignment()');
    expect(performance).toContain('useAssignment()');
  });
});
