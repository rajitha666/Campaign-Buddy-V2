import { describe, it, expect } from 'vitest';
import { staffLabel } from './staffLabel';

describe('staffLabel', () => {
  it('formats as "ID - Full Name"', () => {
    expect(staffLabel({ employeeId: 'EMP-0004', fullName: 'Tharindu Jayasuriya' })).toBe('EMP-0004 - Tharindu Jayasuriya');
  });

  it('falls back to displayName when fullName is missing', () => {
    expect(staffLabel({ employeeId: 'SUP-0001', displayName: 'Dinesh' })).toBe('SUP-0001 - Dinesh');
  });

  it('drops the ID prefix when there is no employeeId', () => {
    expect(staffLabel({ fullName: 'No ID Here' })).toBe('No ID Here');
  });

  it('falls back to id when there is no name at all', () => {
    expect(staffLabel({ id: 'abc-123' })).toBe('abc-123');
  });

  it('returns an empty string for a nullish staff record', () => {
    expect(staffLabel(null)).toBe('');
    expect(staffLabel(undefined)).toBe('');
  });
});
