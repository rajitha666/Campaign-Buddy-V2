import appVersion from '../../version.json';

/**
 * Build identity sent on every request.
 *
 * One store binary talks to many `<agency>.campaignbuddy.lk` servers, each on
 * its own release. These headers are how a tenant backend knows what it is
 * talking to: it can report a real app-version distribution for its fleet, and
 * return 426 when a client is below its `minSupported` floor.
 *
 * `contract` is the /v1 contract revision this build was written against -- see
 * docs/multi-tenant-release-strategy.md section 3.4. The app negotiates features
 * via GET /v1/meta `features[]`, never by comparing server versions; this header
 * is for the server's benefit, not for client-side branching.
 *
 * Platform is injected rather than read from react-native here so this stays a
 * pure module (the app's vitest setup runs node, with no RN runtime).
 */
export function clientIdentityHeaders(platform: string): Record<string, string> {
  return {
    'X-CB-App-Version': appVersion.version,
    'X-CB-App-Build': String(appVersion.build),
    'X-CB-Platform': platform,
    'X-CB-Contract': String(appVersion.contract),
  };
}
