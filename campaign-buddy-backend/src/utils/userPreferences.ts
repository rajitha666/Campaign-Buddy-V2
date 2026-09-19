import { z } from "zod";
import { validationError } from "./apiResponse";

// Registry of per-account portal preferences ("Personalization"). Each key maps
// to a Zod schema for its value; anything not listed here is rejected. To add a
// new personalization option, add a key + schema below — storage is a generic
// key/value table (UserPreference), so no migration is needed.
//
// Keys are namespaced "<area>.<option>". Values must be JSON.

export const MAX_FAVORITES = 12;

// A portal route: leading slash, path characters only — never a full URL.
const routePath = z.string().max(120).regex(/^\/[A-Za-z0-9/_-]*$/, "Must be a portal route path");

export const PREFERENCE_SCHEMAS = {
  // Pages the user pinned to the top of their sidebar, in their chosen order.
  "menu.favorites": z
    .array(routePath)
    .max(MAX_FAVORITES)
    .transform((paths) => [...new Set(paths)]),
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_SCHEMAS;

export interface PreferencePatch {
  set: Array<{ key: PreferenceKey; value: unknown }>;
  reset: PreferenceKey[];
}

// Validates a `{ key: value | null }` body. `null` resets a key to its default.
export function parsePreferencePatch(body: Record<string, unknown>): PreferencePatch {
  const patch: PreferencePatch = { set: [], reset: [] };
  for (const [key, raw] of Object.entries(body)) {
    if (!Object.prototype.hasOwnProperty.call(PREFERENCE_SCHEMAS, key)) {
      throw validationError(`Unknown preference "${key}"`, key);
    }
    const k = key as PreferenceKey;
    if (raw === null) {
      patch.reset.push(k);
      continue;
    }
    const parsed = PREFERENCE_SCHEMAS[k].safeParse(raw);
    if (!parsed.success) {
      throw validationError(parsed.error.issues[0]?.message || `Invalid value for "${key}"`, key);
    }
    patch.set.push({ key: k, value: parsed.data });
  }
  return patch;
}
