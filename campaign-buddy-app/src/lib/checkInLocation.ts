/**
 * GPS fix for check-in. Unlike check-out (#50), the backend requires real
 * coordinates for check-in (used to compute geofence verification), so a
 * denied permission, a GPS error, or a fix that never resolves must all
 * surface as a clear, actionable error rather than hanging or failing
 * silently.
 */
export const LOCATION_UNAVAILABLE_MESSAGE =
  'Your location is turned off. Please turn on location in your device settings to continue with check-in.';

export class LocationUnavailableError extends Error {
  constructor(message: string = LOCATION_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

export interface CheckInLocationDeps {
  requestPermission: () => Promise<{ status: string }>;
  getCurrentPosition: () => Promise<{ coords: { latitude: number; longitude: number } }>;
  timeoutMs?: number;
}

export interface CheckInCoords {
  latitude: number;
  longitude: number;
}

export async function getCheckInCoords({
  requestPermission,
  getCurrentPosition,
  timeoutMs = 8000,
}: CheckInLocationDeps): Promise<CheckInCoords> {
  let permStatus: string;
  try {
    ({ status: permStatus } = await requestPermission());
  } catch {
    throw new LocationUnavailableError();
  }
  if (permStatus !== 'granted') throw new LocationUnavailableError();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const fix = getCurrentPosition()
    .then((position) => position.coords)
    .catch(() => null);
  const coords = await Promise.race([fix, timeout]);
  if (!coords) throw new LocationUnavailableError();
  return coords;
}
