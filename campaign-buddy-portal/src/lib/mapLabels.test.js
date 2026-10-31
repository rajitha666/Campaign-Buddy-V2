import { describe, it, expect } from 'vitest';
import { staffMarkerLabel } from './mapLabels';

describe('staffMarkerLabel', () => {
  it('names the person, the outlet and whether the position is approximate', () => {
    expect(staffMarkerLabel({ staffName: 'Kasun Perera', outletName: 'Nawala Outlet' })).toBe('Kasun Perera, Nawala Outlet');
    expect(staffMarkerLabel({ staffName: 'Kasun Perera', outletName: 'Nawala Outlet', approx: true })).toBe('Kasun Perera, Nawala Outlet (approximate position)');
    expect(staffMarkerLabel({ staffName: 'Kasun Perera' })).toBe('Kasun Perera');
  });
});
