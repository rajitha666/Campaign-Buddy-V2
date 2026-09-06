// The portal's date inputs post "YYYY-MM-DD" strings; Prisma's DateTime columns
// want Date objects (a bare date string throws "premature end of input"). This
// coerces the named keys in place-ish (returns a shallow copy) so the older
// admin CRUD routes accept the portal's payloads without a full validation layer.
export function coerceDates<T extends Record<string, unknown>>(body: T, keys: readonly string[]): T {
  const out: Record<string, unknown> = { ...body };
  for (const key of keys) {
    const v = out[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = new Date(v);
  }
  return out as T;
}
