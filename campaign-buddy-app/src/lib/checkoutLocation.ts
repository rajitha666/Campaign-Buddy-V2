/**
 * Best-effort GPS fix for check-out (#50). Unlike check-in, check-out must
 * never get the rep stuck: the backend already treats check-out coords as
 * optional, so a denied permission, a GPS error, or a fix that never
 * resolves should all fall back to `null` (checkout proceeds without coords)
 * instead of throwing or hanging.
 */
export interface CheckoutLocationDeps {
  requestPermission: () => Promise<{ status: string }>;
  getCurrentPosition: () => Promise<{ coords: { latitude: number; longitude: number } }>;
  timeoutMs?: number;
}

export interface CheckoutCoords {
  latitude: number;
  longitude: number;
}

export async function getCheckoutCoords({
  requestPermission,
  getCurrentPosition,
  timeoutMs = 8000,
}: CheckoutLocationDeps): Promise<CheckoutCoords | null> {
  try {
    const { status } = await requestPermission();
    if (status !== 'granted') return null;

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const fix = getCurrentPosition().then((position) => position.coords).catch(() => null);
    return await Promise.race([fix, timeout]);
  } catch {
    return null;
  }
}
