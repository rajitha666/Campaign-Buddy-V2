/**
 * Where a promoter stands today across the outlets they're assigned to.
 *
 * A promoter can work several outlets in one day (AM at one, PM at another), but
 * only one shift is open at a time and an outlet they've checked out of is closed
 * to them until tomorrow — even if a second campaign runs there. The backend
 * enforces all of this; these helpers let the screens say so before the tap.
 */
export interface AssignmentRef {
  assignmentId: string;
  outlet: { id: string; name?: string };
}

/** True when the promoter has already checked out of `target`'s outlet today (under any campaign). */
export function outletWorked(workedAssignmentIds: string[], assignments: AssignmentRef[], target: AssignmentRef): boolean {
  const workedOutletIds = new Set(assignments.filter((a) => workedAssignmentIds.includes(a.assignmentId)).map((a) => a.outlet.id));
  return workedAssignmentIds.includes(target.assignmentId) || workedOutletIds.has(target.outlet.id);
}

/**
 * Is there an open shift at this outlet? With no outlet given, or when the open
 * shift's outlet isn't known (e.g. a state saved by an older app version), any
 * open shift counts.
 */
export function isCheckedInAt(state: { checkedIn: boolean; openAssignmentId: string | null }, assignmentId?: string): boolean {
  if (!state.checkedIn) return false;
  if (!assignmentId || !state.openAssignmentId) return true;
  return state.openAssignmentId === assignmentId;
}

export type ShiftAtOutlet =
  | { kind: 'ready' }
  | { kind: 'onShift' }
  | { kind: 'elsewhere'; openAssignmentId: string; openOutletName: string | undefined }
  | { kind: 'done'; moreOutlets: boolean };

/** What the Attendance screen should offer for `target`: check in, check out, "finish X first", or "done here". */
export function describeShiftAtOutlet(args: {
  checkedIn: boolean;
  openAssignmentId: string | null;
  workedAssignmentIds: string[];
  assignments: AssignmentRef[];
  target: AssignmentRef;
}): ShiftAtOutlet {
  const { checkedIn, openAssignmentId, workedAssignmentIds, assignments, target } = args;
  if (checkedIn) {
    if (!openAssignmentId || openAssignmentId === target.assignmentId) return { kind: 'onShift' };
    const open = assignments.find((a) => a.assignmentId === openAssignmentId);
    return { kind: 'elsewhere', openAssignmentId, openOutletName: open?.outlet.name };
  }
  if (outletWorked(workedAssignmentIds, assignments, target)) {
    const moreOutlets = assignments.some((a) => !outletWorked(workedAssignmentIds, assignments, a));
    return { kind: 'done', moreOutlets };
  }
  return { kind: 'ready' };
}
