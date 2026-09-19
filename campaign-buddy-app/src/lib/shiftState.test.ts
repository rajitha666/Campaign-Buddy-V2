import { describe, it, expect } from 'vitest';
import { outletWorked, isCheckedInAt, describeShiftAtOutlet } from './shiftState';

const a = (assignmentId: string, outletId: string, outletName = outletId) => ({ assignmentId, outlet: { id: outletId, name: outletName } });
const A = a('act-a', 'out-a', 'Outlet A');
const A2 = a('act-a2', 'out-a', 'Outlet A'); // a second campaign at the same outlet
const B = a('act-b', 'out-b', 'Outlet B');

describe('outletWorked', () => {
  it('is false when nothing has been closed today', () => {
    expect(outletWorked([], [A, B], B)).toBe(false);
  });

  it('is true for an assignment the promoter has checked out of', () => {
    expect(outletWorked(['act-a'], [A, B], A)).toBe(true);
    expect(outletWorked(['act-a'], [A, B], B)).toBe(false);
  });

  it('counts a second campaign at the same outlet as worked', () => {
    expect(outletWorked(['act-a'], [A, A2, B], A2)).toBe(true);
  });
});

describe('isCheckedInAt', () => {
  it('is false when there is no open shift', () => {
    expect(isCheckedInAt({ checkedIn: false, openAssignmentId: null }, 'act-a')).toBe(false);
  });

  it('is true only for the outlet the open shift belongs to', () => {
    const state = { checkedIn: true, openAssignmentId: 'act-a' };
    expect(isCheckedInAt(state, 'act-a')).toBe(true);
    expect(isCheckedInAt(state, 'act-b')).toBe(false);
  });

  it('falls back to "any open shift" when the outlet or the open shift is unknown', () => {
    expect(isCheckedInAt({ checkedIn: true, openAssignmentId: 'act-a' })).toBe(true);
    expect(isCheckedInAt({ checkedIn: true, openAssignmentId: null }, 'act-b')).toBe(true);
  });
});

describe('describeShiftAtOutlet', () => {
  const base = { checkedIn: false, openAssignmentId: null as string | null, workedAssignmentIds: [] as string[], assignments: [A, B] };

  it('is "ready" for an outlet not yet worked with nothing open', () => {
    expect(describeShiftAtOutlet({ ...base, target: A })).toEqual({ kind: 'ready' });
  });

  it('is "onShift" at the open outlet', () => {
    expect(describeShiftAtOutlet({ ...base, checkedIn: true, openAssignmentId: 'act-a', target: A })).toEqual({ kind: 'onShift' });
  });

  it('is "elsewhere" (naming the open outlet) for a different outlet while a shift is open', () => {
    expect(describeShiftAtOutlet({ ...base, checkedIn: true, openAssignmentId: 'act-a', target: B })).toEqual({
      kind: 'elsewhere',
      openAssignmentId: 'act-a',
      openOutletName: 'Outlet A',
    });
  });

  it('is "done" for an outlet already checked out of, and "ready" for the next one', () => {
    const state = { ...base, workedAssignmentIds: ['act-a'] };
    expect(describeShiftAtOutlet({ ...state, target: A })).toEqual({ kind: 'done', moreOutlets: true });
    expect(describeShiftAtOutlet({ ...state, target: B })).toEqual({ kind: 'ready' });
  });

  it('says there are no more outlets when every one has been worked', () => {
    expect(describeShiftAtOutlet({ ...base, workedAssignmentIds: ['act-a', 'act-b'], target: B })).toEqual({ kind: 'done', moreOutlets: false });
  });
});
