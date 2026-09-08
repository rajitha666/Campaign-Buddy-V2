// Phone-number normalization for staff login and admin data entry.
//
// The mobile app lets promoters sign in with their mobile number (issue #3), and
// people type Sri Lankan numbers every which way: "0771234567", "77 123 4567",
// "+94 77 123 4567", "94771234567". We store and match one canonical form:
// E.164, e.g. "+94771234567".

const DIGITS = /\d/g;

/**
 * Canonicalize a Sri Lankan (or already-E.164) phone number.
 * Returns the E.164 string, or `null` if the input doesn't look like a phone
 * number at all (so callers can treat it as a username instead).
 */
export function normalizeLkPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Already E.164-ish: "+" then 10–15 digits.
  if (trimmed.startsWith("+")) {
    const digits = (trimmed.match(DIGITS) || []).join("");
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = (trimmed.match(DIGITS) || []).join("");
  if (digits.length === 0) return null;

  // 0771234567  -> +94771234567
  if (digits.length === 10 && digits.startsWith("0")) return `+94${digits.slice(1)}`;
  // 94771234567 -> +94771234567
  if (digits.length === 11 && digits.startsWith("94")) return `+${digits}`;
  // 771234567   -> +94771234567
  if (digits.length === 9 && digits.startsWith("7")) return `+94${digits}`;

  return null;
}

/** True when `input`, once normalized, is a usable phone number. */
export function looksLikePhone(input: string | null | undefined): boolean {
  return normalizeLkPhone(input) !== null;
}
