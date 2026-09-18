import { describe, it, expect } from 'vitest';
import { exportFilename } from './exportFilename';

describe('exportFilename', () => {
  it('formats as "Report Name - YYYY-MM-DD HH-mm-ss.ext"', () => {
    const date = new Date(2026, 8, 17, 14, 5, 3); // 2026-09-17 14:05:03 local
    expect(exportFilename('Staff Attendance', 'csv', date)).toBe('Staff Attendance - 2026-09-17 14-05-03.csv');
  });

  it('defaults the extension to csv', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    expect(exportFilename('Outlets', undefined, date)).toBe('Outlets - 2026-01-01 00-00-00.csv');
  });

  it('pads single-digit month, day, and time components', () => {
    const date = new Date(2026, 2, 4, 9, 8, 7);
    expect(exportFilename('Reorder', 'csv', date)).toBe('Reorder - 2026-03-04 09-08-07.csv');
  });
});
