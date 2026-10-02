import backendPkg from "../../package.json";

/**
 * The app↔API handshake surface. See docs/multi-tenant-release-strategy.md.
 *
 * There is one iOS build and one Android build in the stores, but every agency
 * runs its own `<agency>.campaignbuddy.lk` deployment on its own release
 * cadence. So the app cannot assume anything about the server it just reached —
 * it asks. The contract is:
 *
 *   - `api.contract` is a monotonic revision of the /v1 response shapes. Bump it
 *     in the same PR as any additive change the app can usefully detect.
 *   - `features[]` is what the app branches on. NEVER branch on `server.version`
 *     in the app: a feature list survives version skew, a version comparison
 *     does not.
 *   - `app.minSupported` is the hard floor. Below it the client gets 426 and a
 *     blocking upgrade screen. `recommended` is only a nudge.
 */

/**
 * Bump when /v1 gains a response field or behaviour the app can detect.
 * Additive only — removing or retyping a /v1 field needs a new major (§3.3).
 */
export const API_CONTRACT_REVISION = 1;

/** Shared with every multer upload limit, so /v1/meta can never misreport it. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Largest offline-queue batch the app should flush in one request. */
export const SYNC_BATCH_MAX = 50;

/**
 * Capabilities this backend build serves. A tenant can switch one off via
 * FEATURES_DISABLED (set from its `tenants/<slug>.yaml` entry) and the app hides
 * the matching screen rather than erroring.
 */
export const FEATURES = [
  "attendance.multiOutlet",
  "issues.reporting",
  "location.tracking",
  "performance.summary",
  "sales.customFields",
  "supervisor.checklist",
  "supervisor.revisits",
  "supervisor.routes",
  "timeOff.requests",
] as const;

function enabledFeatures(): string[] {
  const disabled = new Set(
    (process.env.FEATURES_DISABLED ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
  );
  return FEATURES.filter((f) => !disabled.has(f));
}

export function buildMeta() {
  return {
    tenant: {
      // Unset on a single-tenant/dev box — the app treats that as "the server I
      // was pointed at" and skips the tenant chrome.
      slug: process.env.TENANT_SLUG ?? null,
      displayName: process.env.TENANT_NAME ?? null,
    },
    api: { major: 1, contract: API_CONTRACT_REVISION },
    server: { version: backendPkg.version },
    app: {
      minSupported: process.env.APP_MIN_SUPPORTED_VERSION ?? null,
      recommended: process.env.APP_RECOMMENDED_VERSION ?? null,
      // Which self-hosted OTA bundle stream this server expects (§4.1). This is
      // what keeps an agency on an older backend from pulling JS built for a
      // newer one.
      channel: process.env.APP_UPDATE_CHANNEL ?? null,
    },
    features: enabledFeatures(),
    limits: { photoMaxBytes: PHOTO_MAX_BYTES, syncBatchMax: SYNC_BATCH_MAX },
  };
}
