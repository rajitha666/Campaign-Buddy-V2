/**
 * Prominent in-app disclosure shown once, before the system location prompt
 * (Google Play user-data policy; also good practice on iOS). It says what is
 * collected, why, and when it stops, and the person can decline without the
 * system prompt ever appearing.
 */
export const LOCATION_DISCLOSURE_TITLE = 'Location during your shift';
export const LOCATION_DISCLOSURE_MESSAGE =
  "Campaign Buddy collects your phone's location when you check in and while you're checked in for a shift, " +
  'so your campaign manager can confirm you are at the right outlet. ' +
  'It is shared only with your campaign managers and stops when you check out. ' +
  'Next, your phone will ask permission to share your location.';

type PermissionResult = { status: string };

export interface DisclosureDeps {
  isGranted: () => Promise<boolean>;
  wasShown: () => Promise<boolean>;
  markShown: () => Promise<void>;
  /** Resolves true when the person taps Continue, false for Not now. */
  show: () => Promise<boolean>;
}

/** Wraps a permission request so the disclosure comes first, once. Declining returns `denied` without asking the system. */
export function withLocationDisclosure<R extends PermissionResult>(
  request: () => Promise<R>,
  deps: DisclosureDeps
): () => Promise<R | PermissionResult> {
  return async () => {
    if (!(await deps.isGranted()) && !(await deps.wasShown())) {
      const accepted = await deps.show();
      if (!accepted) return { status: 'denied' };
      await deps.markShown();
    }
    return request();
  };
}
