/**
 * Parses free-typed text from the Stepper's tap-to-edit number field into a
 * clamped integer. Quantities are always whole, non-negative counts, so any
 * non-digit characters (letters, minus signs, decimal points) are stripped
 * rather than rejected — a rep fat-fingering "1o" still lands on 10.
 */
export function parseStepperInput(text: string, min: number, max?: number): number {
  const digitsOnly = text.replace(/[^0-9]/g, '');
  const n = digitsOnly === '' ? min : parseInt(digitsOnly, 10);
  const clampedMin = Math.max(n, min);
  return max !== undefined ? Math.min(clampedMin, max) : clampedMin;
}
