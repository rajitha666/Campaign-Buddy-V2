import { describe, it, expect } from 'vitest';
import { getCheckInCoords, LocationUnavailableError } from './checkInLocation';

const COORDS = { latitude: 6.9, longitude: 79.9 };

describe('getCheckInCoords', () => {
  it('returns coords when permission is granted and the GPS fix resolves', async () => {
    const result = await getCheckInCoords({
      requestPermission: () => Promise.resolve({ status: 'granted' }),
      getCurrentPosition: () => Promise.resolve({ coords: COORDS }),
    });
    expect(result).toEqual(COORDS);
  });

  it('throws LocationUnavailableError when permission is denied', async () => {
    await expect(
      getCheckInCoords({
        requestPermission: () => Promise.resolve({ status: 'denied' }),
        getCurrentPosition: () => Promise.reject(new Error('should not be called')),
      })
    ).rejects.toBeInstanceOf(LocationUnavailableError);
  });

  it('throws LocationUnavailableError when the permission request itself throws', async () => {
    await expect(
      getCheckInCoords({
        requestPermission: () => Promise.reject(new Error('permissions API unavailable')),
        getCurrentPosition: () => Promise.reject(new Error('should not be called')),
      })
    ).rejects.toBeInstanceOf(LocationUnavailableError);
  });

  it('throws LocationUnavailableError when the GPS fix errors', async () => {
    await expect(
      getCheckInCoords({
        requestPermission: () => Promise.resolve({ status: 'granted' }),
        getCurrentPosition: () => Promise.reject(new Error('GPS unavailable')),
      })
    ).rejects.toBeInstanceOf(LocationUnavailableError);
  });

  it('throws LocationUnavailableError instead of hanging when the GPS fix never resolves', async () => {
    await expect(
      getCheckInCoords({
        requestPermission: () => Promise.resolve({ status: 'granted' }),
        getCurrentPosition: () => new Promise(() => {}),
        timeoutMs: 20,
      })
    ).rejects.toBeInstanceOf(LocationUnavailableError);
  });
});
