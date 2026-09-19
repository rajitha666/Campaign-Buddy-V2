import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Multi-outlet promoters: a promoter can hold two same-day Activations, so the
// app must let them CHOOSE which outlet is live (the old /today flow silently
// showed only the server's findFirst pick). Home leads the picker and every
// scoped screen (Attendance check-in/out, Stats update, Sales confirm,
// Products, Performance) reads the same chosen assignment — one outlet at a
// time under the one-open-shift lock.
describe('promoter outlet chooser wiring', () => {
  const context = readFileSync(join(__dirname, '..', 'context', 'AssignmentContext.tsx'), 'utf8');
  // Matched across line breaks below; normalise so a Windows (autocrlf) checkout behaves like CI.
  const home = readFileSync(join(__dirname, 'HomeScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const attendance = readFileSync(join(__dirname, 'AttendanceScreen.tsx'), 'utf8');
  const stats = readFileSync(join(__dirname, 'StatsUpdateScreen.tsx'), 'utf8');
  const summary = readFileSync(join(__dirname, 'SalesSummaryScreen.tsx'), 'utf8');
  const products = readFileSync(join(__dirname, 'ProductsScreen.tsx'), 'utf8');
  const performance = readFileSync(join(__dirname, 'PerformanceScreen.tsx'), 'utf8');

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
    expect(attendance).toContain('assignmentId={assignment?.assignmentId}');
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
