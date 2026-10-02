/**
 * Which agency's deployment this install is talking to.
 *
 * There is one build in the stores and many `<slug>.campaignbuddy.lk` servers,
 * so the slug is the tenant's identity on every surface -- including every key
 * this app writes to the device. Without that, a queued sales update for one
 * agency could flush to another agency's server after an account switch, which
 * is silent data corruption rather than a visible error.
 *
 * See docs/multi-tenant-release-strategy.md sections 2.1 and 8.
 */

let tenant: string | null = null;

/** Pass null to clear (sign-out of a tenant, or a pre-multi-tenant install). */
export function setCurrentTenant(slug: string | null): void {
  tenant = slug || null;
}

export function currentTenant(): string | null {
  return tenant;
}

/**
 * Empty until a tenant is pinned, which keeps keys byte-identical to what
 * pre-multi-tenant installs already wrote. Changing the format unconditionally
 * would orphan a field rep's queued offline work on the next app update.
 */
function tenantSuffix(): string {
  return tenant ? `@${tenant}` : '';
}

/**
 * Key for bulk app data (AsyncStorage -- offline queue, cached payloads).
 *
 * `global` keys are the ones that must be readable before we know who is signed
 * in (the session snapshot). They skip the user scope but are still
 * tenant-scoped: by the time anything reads them the tenant is already resolved,
 * and a shared handset used by reps of two agencies must not mix them up.
 */
export function deviceStorageKey(baseKey: string, userScope: string, global = false): string {
  const t = tenantSuffix();
  return global ? `${baseKey}${t}` : `${baseKey}${t}:${userScope}`;
}

/** Key for credentials (SecureStore -- Keychain / Keystore). */
export function secureStoreKey(baseKey: string): string {
  return `${baseKey}${tenantSuffix()}`;
}

/**
 * The trailing namespace every non-global key carries, e.g. `@acme:user-1`, or
 * `:user-1` with no tenant pinned. Used to sweep one tenant+user's keys without
 * touching another tenant's keys for the same user id.
 */
export function scopedKeyTail(userScope: string): string {
  return deviceStorageKey('', userScope);
}
