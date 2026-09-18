/**
 * Target for shrinking a phone photo before upload. Only the longer side is
 * returned so the aspect ratio is preserved; null means "already small enough"
 * (or the size is unknown) and the photo is only re-compressed.
 */
export function resizeTarget(width: number, height: number, maxSide: number): { width: number } | { height: number } | null {
  if (!width || !height) return null;
  if (Math.max(width, height) <= maxSide) return null;
  return width >= height ? { width: maxSide } : { height: maxSide };
}
