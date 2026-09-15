// Phone-number normalization for staff login and admin data entry.
//
// The mobile app lets promoters sign in with their mobile number (issue #3), and
// people type Sri Lankan numbers every which way: "0771234567", "77 123 4567",
// "+94 77 123 4567", "94771234567". We store and match one canonical form:
// the local Sri Lankan format, e.g. "0771234567" (issue #22 — dropped the E.164
// "+94" prefix in favour of the format staff actually type and recognize).
//
// A "+"-prefixed number for some OTHER country (no local-SL representation
// exists for it) is left as E.164 rather than rejected — e.g. an emergency
// contact living abroad.

const DIGITS = /\d/g;

/**
 * Canonicalize a Sri Lankan phone number to local format ("0771234567").
 * A non-Sri-Lankan E.164 number ("+1...") is kept as-is. Returns `null` if
 * the input doesn't look like a phone number at all (so callers can treat it
 * as a username instead).
 */
export function normalizeLkPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = (trimmed.match(DIGITS) || []).join("");
  if (digits.length === 0) return null;

  // 0771234567          -> 0771234567 (already local)
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  // +94771234567 / 94771234567 -> 0771234567
  if (digits.length === 11 && digits.startsWith("94")) return `0${digits.slice(2)}`;
  // 771234567           -> 0771234567
  if (digits.length === 9 && digits.startsWith("7")) return `0${digits}`;

  // Not a recognizable Sri Lankan number — keep a foreign E.164 as-is.
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;

  return null;
}

/** True when `input`, once normalized, is a usable phone number. */
export function looksLikePhone(input: string | null | undefined): boolean {
  return normalizeLkPhone(input) !== null;
}

/**
 * Normalize one phone-ish field of a write payload in place. Leaves
 * non-strings, empty values and `undefined` (field omitted) untouched, and
 * falls back to the raw value if it doesn't normalize (the validator should
 * already have rejected that — this is a defensive fallback, not a bypass).
 */
export function normalizePhoneField<T>(value: T): T | string {
  if (typeof value !== "string" || !value.trim()) return value;
  return normalizeLkPhone(value) ?? value;
}
