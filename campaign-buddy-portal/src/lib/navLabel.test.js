import { describe, it, expect } from 'vitest';
import { findLabel, documentTitle } from './navLabel';

describe('navLabel', () => {
  it('finds a top-level and a nested page', () => {
    expect(findLabel('/dashboard').title).toBe('Dashboard');
    expect(findLabel('/staff/attendance')).toEqual({ title: 'Attendance', crumb: 'Staff' });
  });

  it('builds a tab title from section + page', () => {
    expect(documentTitle('/staff/attendance')).toBe('Staff · Attendance — Campaign Buddy');
    expect(documentTitle('/dashboard')).toBe('Dashboard — Campaign Buddy');
    expect(documentTitle('/personalization')).toBe('Account · Personalization — Campaign Buddy');
  });

  it('falls back to the product name for unknown routes', () => {
    expect(documentTitle('/nope/never')).toBe('Campaign Buddy');
  });
});
