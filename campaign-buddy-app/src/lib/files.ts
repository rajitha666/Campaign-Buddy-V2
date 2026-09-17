/**
 * Resolves file paths the API returns (e.g. staff profilePictureUrl stored as
 * a relative `/uploads/staff/<file>` and served statically — issue #29) into
 * absolute URLs. React Native's <Image> can't load a relative path because it
 * has no document origin, so without this the profile picture never renders
 * in the app while the portal (same origin as the API) shows it fine (#41).
 */
export function resolveFileUrl(
  path: string | null | undefined,
  apiBaseUrl: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL
    ?? 'https://api.campaignbuddy.lk/v1',
  uploadsOrigin: string | undefined = process.env.EXPO_PUBLIC_UPLOADS_ORIGIN
): string | null | undefined {
  if (!path || /^https?:\/\//i.test(path)) return path;
  // The upload root is the API origin; drop the /v1 prefix the client uses.
  const origin = (uploadsOrigin ?? apiBaseUrl)
    .replace(/\/v1\/?$/i, '')
    .replace(/\/+$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
