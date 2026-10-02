import { describe, expect, it } from "vitest";
import { validateTenantSlug, assertTenantSlugEnv, RESERVED_SLUGS } from "../src/utils/meta";

// The slug is the tenant's identity on every surface -- subdomain, JWT `aud`,
// device storage namespace, OTA routing. See
// docs/multi-tenant-release-strategy.md section 2.
describe("validateTenantSlug", () => {
  it("accepts the shapes a subdomain can safely carry", () => {
    for (const slug of ["ac", "acme", "acme-field", "a1b2", "x".repeat(21)]) {
      expect(validateTenantSlug(slug), slug).toEqual({ ok: true });
    }
  });

  it("rejects shapes that break DNS, casing or length assumptions", () => {
    for (const slug of ["a", "x".repeat(22), "Acme", "acme_field", "-acme", "acme-", "acme.field", ""]) {
      expect(validateTenantSlug(slug).ok, slug).toBe(false);
    }
  });

  it("rejects slugs that would hijack a hostname we already route", () => {
    // deploy/cloudflared/config.yml serves www/office/app/api on the apex
    // domain -- an agency taking `api` would capture the whole fleet's API.
    for (const slug of ["api", "app", "office", "www"]) {
      expect(validateTenantSlug(slug), slug).toMatchObject({ ok: false, reason: expect.stringContaining("reserved") });
    }
    expect(RESERVED_SLUGS).toContain("api");
  });
});

describe("assertTenantSlugEnv", () => {
  it("accepts an unset slug — single-tenant and dev deployments have none", () => {
    expect(() => assertTenantSlugEnv(undefined)).not.toThrow();
    expect(() => assertTenantSlugEnv("")).not.toThrow();
  });

  it("throws on a misconfigured slug rather than serving a broken identity", () => {
    // Boot-time failure is deliberate: the slug feeds the JWT audience and the
    // app's per-tenant storage namespace, so a typo here is a cross-tenant data
    // risk, not a cosmetic one. The deploy's health gate catches it pre-cutover.
    expect(() => assertTenantSlugEnv("Acme Ltd")).toThrow(/TENANT_SLUG/);
    expect(() => assertTenantSlugEnv("api")).toThrow(/reserved/);
  });
});
