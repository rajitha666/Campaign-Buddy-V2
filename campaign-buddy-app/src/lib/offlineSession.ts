/**
 * Whether a cold start with no network can resume the stored session instead
 * of bouncing to Login. Deliberately narrow: only on a day the rep has a shift
 * that isn't over — checked in and not out, or assigned today and not yet
 * checked in (check-in works offline too). No offline password login exists;
 * this only resumes a session that was already valid.
 */
export interface OfflineSessionState {
  hasCachedUser: boolean;
  checkedInToday: boolean;
  checkedOutToday: boolean;
  /** Today's assignment is in the local cache (fetched earlier today). */
  hasTodayAssignment: boolean;
}

export function canResumeOffline(s: OfflineSessionState): boolean {
  return s.hasCachedUser && !s.checkedOutToday && (s.checkedInToday || s.hasTodayAssignment);
}
