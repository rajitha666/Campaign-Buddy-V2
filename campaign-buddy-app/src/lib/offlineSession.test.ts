import { describe, it, expect } from 'vitest';
import { canResumeOffline } from './offlineSession';

const base = { hasCachedUser: true, checkedInToday: false, checkedOutToday: false, hasTodayAssignment: false };

describe('canResumeOffline', () => {
  it('resumes mid-shift: cached profile, checked in today, not checked out', () => {
    expect(canResumeOffline({ ...base, checkedInToday: true })).toBe(true);
  });

  it('resumes BEFORE check-in when today has an assignment — the rep can check in offline', () => {
    expect(canResumeOffline({ ...base, hasTodayAssignment: true })).toBe(true);
  });

  it('does not resume without a cached profile', () => {
    expect(canResumeOffline({ ...base, hasCachedUser: false, checkedInToday: true })).toBe(false);
  });

  it('does not resume when there is no shift today (never checked in, nothing assigned)', () => {
    expect(canResumeOffline(base)).toBe(false);
  });

  it('does not resume once the rep has checked out — the shift is over', () => {
    expect(canResumeOffline({ ...base, checkedInToday: true, checkedOutToday: true })).toBe(false);
    expect(canResumeOffline({ ...base, hasTodayAssignment: true, checkedOutToday: true })).toBe(false);
  });
});
