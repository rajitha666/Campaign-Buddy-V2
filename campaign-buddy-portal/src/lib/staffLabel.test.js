import { describe, it, expect } from 'vitest';
import { staffLabel } from './staffLabel';

describe('staffLabel', () => {
  it('shows the full name only — no employee ID (dropdowns/tables show names, not codes)', () => {
    expect(staffLabel({ employeeId: 'EMP-0004', fullName: 'Tharindu Jayasuriya' })).toBe('Tharindu Jayasuriya');
  });

  it('falls back to displayName when fullName is missing', () => {
    expect(staffLabel({ employeeId: 'SUP-0001', displayName: 'Dinesh' })).toBe('Dinesh');
  });

  it('falls back to id when there is no name at all', () => {
    expect(staffLabel({ id: 'abc-123' })).toBe('abc-123');
  });

  it('returns an empty string for a nullish staff record', () => {
    expect(staffLabel(null)).toBe('');
    expect(staffLabel(undefined)).toBe('');
  });
});
