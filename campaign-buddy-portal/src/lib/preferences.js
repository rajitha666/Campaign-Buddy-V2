import { FAVORITES_KEY } from './favorites';

// Every per-account personalization key the portal knows about (the backend
// registry, utils/userPreferences.ts, is the source of truth for validation).
// "Reset personalization" clears exactly these.
export const PREFERENCE_KEYS = [FAVORITES_KEY];

// Apply a `{ key: value | null }` patch locally — `null` removes the key,
// mirroring PUT /me/preferences, so the UI can update before the save returns.
export function applyPreferencePatch(prefs, patch) {
  const next = { ...prefs };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}
