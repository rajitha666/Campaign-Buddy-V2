import { describe, it, expect, vi } from 'vitest';
import { getCheckoutCoords } from './checkoutLocation';

const COORDS = { latitude: 6.9, longitude: 79.9 };

describe('getCheckoutCoords (#50)', () => {
  it('returns coords when permission is granted and the GPS fix resolves', async () => {
    const result = await getCheckoutCoords({
      requestPermission: () => Promise.resolve({ status: 'granted' }),
      getCurrentPosition: () => Promise.resolve({ coords: COORDS }),
    });
    expect(result).toEqual(COORDS);
  });

  it('returns null instead of throwing when permission is denied', async () => {
    const result = await getCheckoutCoords({
      requestPermission: () => Promise.resolve({ status: 'denied' }),
      getCurrentPosition: () => Promise.reject(new Error('should not be called')),
    });
    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the GPS fix errors', async () => {
    const result = await getCheckoutCoords({
      requestPermission: () => Promise.resolve({ status: 'granted' }),
      getCurrentPosition: () => Promise.reject(new Error('GPS unavailable')),
    });
    expect(result).toBeNull();
  });

  it('returns null instead of hanging when the GPS fix never resolves', async () => {
    const result = await getCheckoutCoords({
      requestPermission: () => Promise.resolve({ status: 'granted' }),
      getCurrentPosition: () => new Promise(() => {}),
      timeoutMs: 20,
    });
    expect(result).toBeNull();
  });
});
