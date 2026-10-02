# Campaign Buddy — Multi-Tenant Hosting & Release Strategy

**Status:** proposal (strategy agreed before implementation)
**Scope:** how one App Store / Play Store binary serves many agencies, each on
its own `<agency>.campaignbuddy.lk` deployment running its own server version.

---

## 1. The problem, stated precisely

Onboarding agencies as separately-hosted tenants gives each one:

- its own subdomain (`acme.campaignbuddy.lk`) and its own database
- its own deploy cadence, controlled by the agency's change process

But there is exactly **one** iOS app and **one** Android app in the stores. So at
any moment the field has an arbitrary mix of:

| Axis | Spread |
|---|---|
| App version on device | whatever each promoter installed; store rollouts are gradual and users defer updates |
| Server version per tenant | whatever each agency last accepted |

That is an N×M compatibility matrix, and it grows without bound. The strategy
below does not try to test N×M. It collapses the problem to **one negotiated
contract** plus **a bounded support window**, and makes the fleet machine-legible
so it can be operated by agents rather than by memory.

Seven pillars:

1. Tenant discovery — the app finds the right server at runtime
2. API contract versioning — capability negotiation, not version sniffing
3. The update ladder — four tiers, including per-tenant OTA
4. Push as an invalidation signal, not an update transport
5. Release trains — bounded drift instead of unbounded drift
6. Fleet observability and the AI-native operations layer
7. Security and isolation consequences

---

## 2. Pillar 1 — Tenant discovery

**Today:** the API base URL is baked at build time —
`campaign-buddy-app/src/api/client.ts:22`, `src/lib/files.ts:10`,
`src/lib/trainingGuide.ts:16` all read `EXPO_PUBLIC_API_BASE_URL` with a
hardcoded `https://api.campaignbuddy.lk/v1` fallback. One store binary cannot do
this. Tenant selection has to move to runtime.

### 2.1 The slug is the tenant's identity, everywhere

Adopt Slack's model: **one slug, used on every surface.** Slack does not have a
workspace URL *and* a separate login code — `acme.slack.com`, the invite link,
the mobile "sign in manually" field, the SSO config and the deep links all carry
the same `acme`. That consistency is the actual idea worth copying, and it is
simpler than what this document originally proposed.

For Campaign Buddy the slug is already implied by the hosting decision
(`acme.campaignbuddy.lk`). Make it explicit and canonical — one string that is:

| Surface | Use |
|---|---|
| Hosting | `acme.campaignbuddy.lk` subdomain |
| Config | `TENANT_SLUG`, and the `tenants/acme.yaml` filename |
| Handshake | `tenant.slug` in `GET /v1/meta` |
| Auth | the `aud` claim on every staff JWT (§8) |
| Device | the secure-store and offline-queue namespace (§8) |
| OTA | the tenant header the self-hosted update server routes on (§4.1) |
| Invite | `https://go.campaignbuddy.lk/j/acme` |
| Support | "what's your workspace?" — one word, not a UUID |

No tenant UUID, no separate workspace code, no second identifier to keep in sync.

**The base URL is derived from the slug**, not stored:
`acme` → `https://acme.campaignbuddy.lk/v1`. One source of truth, no stale URL to
go bad, and a typo fails fast at DNS. The app keeps the template, and `/v1/meta`
may return a canonical `apiBaseUrl` that overrides and is then cached — so a
future custom domain (`field.acmemarketing.lk`) or a regional host needs no store
release.

### 2.2 Slug rules — and a collision already waiting

Slack's constraints, which exist for good reasons: lowercase, 2–21 characters,
letters/digits/hyphens only, no leading or trailing hyphen, globally unique, and
changeable only with a redirect left behind.

**The reserved list is not optional here.** `deploy/cloudflared/config.yml`
already routes `www`, `office`, `app` and `api` on `campaignbuddy.lk`. Onboarding
an agency that picks the slug `app` would hijack the PWA host; `api` would hijack
the production API for the whole fleet. Reserve, at minimum:

```
www  api  app  office  admin  dashboard  directory  push  go  cdn  static
assets  mail  smtp  status  help  support  docs  blog  staging  dev  test  demo
```

Enforce it at tenant creation, in the same validator that checks the slug shape —
not as a wiki page someone is supposed to remember.

### 2.3 Resolution order on the device

First match wins:

| # | Layer | Carries the slug how | Applies when |
|---|---|---|---|
| 1 | **Managed app configuration** (iOS Managed App Config / Android Enterprise) | agency MDM pushes it | agency owns the handsets |
| 2 | **Invite link / QR, deferred deep linking** | embedded in the link | every agency go-live — the rollout path |
| 3 | **Manual slug entry** | promoter types `acme` | reinstall, support, staging |

Layer 2 does the real work. The agency supervisor onboards a cohort in one
session: everyone scans the same QR from CB Office, or taps one WhatsApp link.
**Deferred deep linking** is what makes it hold together — the promoter taps
before installing, passes through the store, and the app reads the original link
on first launch. Use one `go.campaignbuddy.lk` redirector rather than
universal-link configuration on every tenant subdomain: a single
`apple-app-site-association` and one Android App Links verification, instead of N.

Layer 3 is the honest cost of slug-primary: **a promoter who reinstalls has lost
the slug.** Mitigations, all cheap: the invite link stays valid and re-sendable
from CB Office, Profile displays the workspace prominently so it can be
screenshotted, and support can answer it in one word. Slack has exactly this
problem and solves it exactly this way.

### 2.4 Phone-number discovery — deferred, not dropped

The earlier draft made a central `directory.campaignbuddy.lk` the primary path:
`POST /discovery/resolve { phone }` → tenant, so the login screen never changed.
It is still the right design *if it is needed*, and the constraints it would have
to meet are recorded here because they are easy to get wrong:

- holds only `{ slug, displayName, apiBaseUrl, logoUrl, status }` plus the index —
  no staff records, no credentials, no campaign data
- the index stores `HMAC(phone, secret)`, never raw numbers, pushed as deltas by
  each tenant backend on staff create/deactivate
- hard per-IP and per-device rate limits, and a uniform response shape whether or
  not a match exists, so it is not a phone-number oracle
- on the critical path only at first login; the resolved base URL is cached, so a
  directory outage never breaks a working install

**But it is deferred out of Phase 1.** Once layer 2 carries the slug, nearly no
promoter ever types it, which leaves the directory serving only reinstalls — a
support-ticket-sized problem, bought at the price of a new always-on central
service holding a PII-derived index, with a sync job from every tenant backend
and enumeration-resistance to get right.

Worth noting *why* the industry leans the other way: Slack, M365 Autodiscover,
Salesforce and Okta all discover by **email domain**, which is a pure function —
`@acme.com → acme`, no index, no PII, no service to secure. Campaign Buddy's
promoters log in by phone, which has no domain, so the same convenience costs
infrastructure that those products get for free. That asymmetry is the whole
argument for slug-primary.

Revisit when reinstall support volume justifies it, or if a promoter population
ever logs in by email.

---

## 3. Pillar 2 — API contract versioning

**Today there are three unrelated version notions**, which is the root of the
confusion:

| Where | Value |
|---|---|
| URL path | `/v1` |
| `campaign-buddy-backend/package.json` | `3.0.0` |
| `GET /health` response | `spec: "v3"` |

And there is no floor version, no capability list, no contract revision. Replace
with a deliberate three-layer model.

### 3.1 Layer 1 — major version in the path

`/v1` changes only on a genuine breaking redesign — expect years between bumps.
When it happens, both majors are served in parallel for the whole support window.

### 3.2 Layer 2 — capability negotiation via `GET /v1/meta`

Unauthenticated, cacheable, the single handshake endpoint:

```json
{
  "tenant":  { "slug": "acme", "displayName": "Acme Field Marketing" },
  "api":     { "major": 1, "contract": 42 },
  "server":  { "version": "3.4.1", "builtAt": "2026-09-28T04:00:00Z" },
  "app": {
    "minSupported": "1.0.10",
    "recommended":  "1.2.0",
    "channel":      "stable-2026-10",
    "storeUrl": { "ios": "…", "android": "…" }
  },
  "features": ["offline.issueReports", "sales.customFields.v2",
               "supervisor.routes", "supervisor.revisits"],
  "limits":   { "photoMaxBytes": 2097152, "syncBatchMax": 50 }
}
```

**The app branches on `features[]`, never on `server.version`.** Feature
detection over version detection is the single rule that lets one binary work
correctly against servers six months apart. A screen whose backend support is
missing hides itself; it does not error.

`/v1/meta` is the natural extension of the existing
`/admin/v1/system/status` (`src/modules/admin/system.routes.ts`, already
reporting `backendVersion`) — same information, exposed to the app and to the
fleet dashboard instead of only to Super Admin.

### 3.3 Layer 3 — additive-only evolution within a major

- Never remove a field, never change a field's type, never narrow an enum in
  `/v1`. New behavior arrives as new optional fields plus a feature flag.
- Deprecations get a two-release window and `Deprecation` / `Sunset` response
  headers (RFC 8594 / 9745). The app logs them; the fleet dashboard surfaces
  which tenants still depend on a sunsetting field.
- Breaking a field means a new field, not a changed one. The old one goes quiet
  only after the support window has passed for every tenant.

### 3.4 Client identity on every request

```
X-CB-App-Version: 1.0.13
X-CB-App-Build:   100013
X-CB-Platform:    android
X-CB-Contract:    42
```

This buys three things: a true app-version distribution per tenant; the ability
to return `426 Upgrade Required` with a structured body when a client is below
`minSupported`; and the option to shim responses for a known-old client at the
edge if ever needed.

### 3.5 The published compatibility window

The guarantee that bounds the test matrix — write it down and honour it:

> A server release supports every app release from the preceding **6 months**.
> An app release works against every server at **contract revision ≥ (current − 6)**.

CI then runs the app's contract tests against **the oldest supported backend
tag**, not only `main`. Without a written window, §3's promises are unenforceable
and §5's release trains have nothing to anchor to.

---

## 4. Pillar 3 — the update ladder

Four tiers, each a different trade of reach, latency and risk:

| Tier | Mechanism | Latency | Can change |
|---|---|---|---|
| 0 | Server-driven config — `features[]`, `limits`, remote copy | seconds | toggles, thresholds, wording. No deploy. |
| 1 | **OTA JS update** (`expo-updates`) | minutes | all JS/TS and assets — ~95% of the app's code |
| 2 | Store binary, staged rollout | 1–7 days | native modules, permissions, SDK upgrades |
| 3 | Forced-upgrade gate (`minSupported` → `426` → blocking screen) | immediate | last resort: security, data integrity |

**`expo-updates` is not currently installed** (`campaign-buddy-app/package.json`
has no `expo-updates`, no `eas.json` exists). Every fix today — including a
one-line crash fix like `4a69ecd` — needs a full store release. Adding Tier 1 is
the highest-leverage change in this document.

### 4.1 The decisive detail: OTA channel must be per tenant

Because tenants sit on different server versions, a single global JS bundle would
have to be compatible with all of them simultaneously — which is exactly the
constraint we are trying to escape. Instead:

- `/v1/meta` tells the app which bundle stream its server expects:
  `"channel": "stable-2026-10"`.
- The app sets that channel on `expo-updates` before the update check.
- Acme, on last month's backend, stays on the matching JS bundle. Beta Agency, on
  this week's backend, gets this week's bundle. **One store binary, N JS bundle
  streams, each matched to its server.**

**Decided: self-hosted update server** on the existing VPS (§11 decision 2). The
app sends its tenant as a request header; the server decides which bundle to
return. `expo-updates` supports a custom `updates.url`, so this needs no Expo
hosted service and no dependency on whether SDK 57 permits runtime channel
override — the ambiguity that would otherwise sit under this whole pillar.

EAS Update remains a viable later migration if the hosting burden outgrows its
value, but it is not on the critical path.

### 4.2 Guardrails

- `runtimeVersion: { policy: "fingerprint" }` — a JS bundle is only ever served
  to a native binary whose fingerprint matches, so JS and native cannot desync.
- Staged rollout per channel: 10% → 50% → 100%, with rollback-to-embedded as the
  kill switch.
- Keep OTA changes within the app's declared purpose and never add anything
  needing a new permission — that is the line both stores care about.

---

## 5. Pillar 4 — push notifications

Push is **not** an update transport. It is an invalidation signal that removes
waiting.

`expo-notifications` is also not installed today.

- Device registers with **its own tenant** backend:
  `POST /v1/devices { token, appVersion, build, platform, channel }`. This
  doubles as the fleet inventory — which app versions are actually live at each
  agency, visible in CB Office.
- **Silent/data push** triggers work: "config changed, refetch `/v1/meta`", "an
  OTA is waiting, check now", "server moved to contract 43".
- **Visible push** for what field ops genuinely needs: shift reminders, a
  supervisor task assigned, a forced-upgrade warning 48h ahead, campaign start.
- **Fallback is mandatory, not optional.** Cheap Android handsets with aggressive
  battery managers — common in this market — silently drop push. So `/v1/meta` is
  also polled on app foreground and on a ~6-hour tick. `expo-background-task` is
  already wired for offline sync; piggyback on it.

### 5.1 Credentials belong in one place

There is one store app, therefore one FCM project and one APNs key. Those
secrets must **not** be copied onto every agency's VPS.

Run a central **push relay** (`push.campaignbuddy.lk`). Tenant backends call it
with a signed service token scoped to their own `staffId` namespace; the relay
holds the platform credentials. One secret to rotate, a full audit trail, and a
compromised agency VPS cannot leak the APNs key or push to another tenant's
devices.

---

## 6. Pillar 5 — release trains (bounding the drift)

Agencies controlling their own deploy timing is reasonable. Agencies drifting
arbitrarily far behind is not — it is what makes the matrix unbounded.

| Channel | Who | Cadence | Content |
|---|---|---|---|
| `edge` | internal / demo tenant | every merge to `main` | unreleased |
| `beta` | 1–2 design-partner agencies | weekly | release candidate |
| `stable` | most agencies | monthly, tagged `3.5.0` | current GA |
| `lts` | conservative enterprise tenants | quarterly pin + backported security patches | `3.4.x` |

Each tenant is assigned a channel in the central registry. **Policy: at most two
stable releases behind (~2 months).** Past that, patches stop and it becomes a
contractual escalation. That single rule turns the support matrix finite: test
app N against `stable`, `stable-1`, `stable-2`, and `lts`.

### 6.1 Mechanics

- **Digest-pinned images.** `docker-compose.yml:26` currently uses
  `campaign-buddy-backend:local`, built on the VPS by `deploy-prod.sh`. That
  cannot be promoted, pinned per tenant, or rolled back. Build once in CI, push
  `ghcr.io/…/campaign-buddy-backend:3.5.0@sha256:…`, and promote **that digest**
  through the channels.
- **Per-tenant declarative config**, version-controlled:

  ```yaml
  # tenants/acme.yaml
  slug: acme
  domain: acme.campaignbuddy.lk
  channel: stable
  pinnedVersion: 3.4.1@sha256:…
  appChannel: stable-2026-10
  featureOverrides: { sales.customFields.v2: false }
  pushEnabled: true
  ```

  A deploy is a PR against this file; CI reconciles. GitOps — and it is also what
  makes the whole fleet legible to an agent (§7).
- **Expand/contract migrations.** Every migration must be backward compatible for
  one release: the deploy adds columns and writes both ways; the *next* release
  removes the old path. This is what makes per-tenant rollback safe and lets an
  older app keep working across a server upgrade. With 19 Prisma migrations and
  growing, codify this now rather than after the first bad night.
- **Ingress.** `deploy/cloudflared/config.yml` hardcodes four `campaignbuddy.lk`
  hostnames. Move to wildcard `*.campaignbuddy.lk` with host-based routing, or
  generate the tunnel config per tenant from the registry.
- Zero-downtime per tenant: migrate → start new → health-gate on `/health` and
  `/v1/meta` → cut over → retain the previous digest for instant rollback.

---

## 7. Pillar 6 — fleet observability and the AI-native layer

This is where "AI-native" earns its keep: not a chatbot, but making operational
state machine-legible so agents can act on it.

- **Fleet dashboard** in CB Office (Super Admin): per tenant — server version,
  contract revision, OTA channel and current bundle, app-version histogram from
  the device registry, pending migrations, last successful deploy, days behind
  stable, license usage. The natural multi-tenant extension of the existing
  `/system/status` and `/license/usage`.
- **Extend `campaign-buddy-mcp`** with fleet tools: `fleet.listTenants`,
  `fleet.getTenantVersion`, `fleet.appVersionDistribution`,
  `fleet.pendingUpgrades`, `fleet.releaseNotesSince`. Then *"which agencies run a
  backend older than 3.4 and have more than 20% of devices below minSupported?"*
  is one question instead of an afternoon. An MCP surface over your own
  operational state is the genuinely AI-native pattern here.
- **Upgrade-readiness agent**, following the existing `triage-agent/` shape: a
  scheduled job that per tenant diffs installed vs stable, reads the changelog,
  checks migration compatibility and the device histogram, and opens a PR against
  `tenants/<slug>.yaml` with a plain-English risk summary. A human approves —
  same discipline as the existing `approved-for-build` label.
- **Contract-drift CI gate.** There is already a precedent: the mcp-sync-agent
  gate keeps `campaign-buddy-mcp/` in step with backend changes
  (`docs/mcp-sync-agent.md`). Add the same shape for the app↔API contract — commit
  a generated contract snapshot; any PR changing a `/v1` response shape must be
  additive, or bump the contract revision and declare a feature flag, or CI
  fails. This mechanically prevents the class of breakage the whole strategy
  exists to survive.
- Structured logs and traces tagged `tenant`, `appVersion`, `contract` — so
  "errors only on app 1.0.11 against contract 41" is a query, not a hunch.

---

## 8. Pillar 7 — security and isolation

- **Token audience.** Per-tenant `STAFF_JWT_SECRET` already gives isolation —
  keep it, never unify, and add `aud: "<slug>"` / `iss` claims so a token cannot
  be replayed against another tenant even if secrets were ever consolidated.
- **Namespace device storage per tenant.** `ACCESS_TOKEN_KEY = 'cb_access_token'`
  and `REFRESH_TOKEN_KEY` (`src/api/client.ts:24-25`) are flat. With one binary
  talking to many servers, account switching would cross-contaminate.
- **Namespace the offline queue per tenant.** `src/offline/storage.ts` already
  scopes keys by `userId` via `setStorageScope`, which is the right mechanism —
  extend the scope to `${tenant}:${userId}`. This matters more than it looks: a
  queued stats update for Acme flushing to Beta's server is silent data
  corruption, and the current flat `cb_offline_queue` makes it possible.
- **Block tenant switching while the queue is non-empty**, or drain first.
- Wildcard TLS for `*.campaignbuddy.lk`.
- **Do not pin leaf certificates.** In a wildcard multi-tenant setup leaf pinning
  is an outage generator. Pin to the CA or not at all.
- Per-tenant database isolation comes free from deployment-per-agency — document
  it as the data-residency selling point it is.

---

## 9. Gaps in the current codebase

| # | Gap | Where |
|---|---|---|
| 1 | API base URL baked at build time — blocks one-binary-many-tenants | `app/src/api/client.ts:22`, `app/src/lib/files.ts:10`, `app/src/lib/trainingGuide.ts:16` |
| 2 | No `expo-updates` — no OTA path at all; every fix needs a store release | `app/package.json` |
| 3 | No `expo-notifications` — no push, no device registry, no fleet visibility | `app/package.json` |
| 4 | App version has three sources of truth: `1.0.13`, `1.0.4`, `versionCode 100013` | `app/app.json:4`, `app/package.json:3`, `app/android/app/build.gradle:95` |
| 5 | Three unrelated backend version notions; no `minSupported`, no `features[]`, no contract revision | `backend/package.json:3`, `backend/src/app.ts:22` |
| 6 | `campaign-buddy-backend:local` built on the host — not promotable, pinnable or rollback-able | `docker-compose.yml:26`, `deploy-prod.sh` |
| 7 | Tunnel config hardcodes four hostnames — doesn't scale to per-agency subdomains | `deploy/cloudflared/config.yml` |
| 8 | Flat secure-store keys and tenant-blind offline queue — cross-tenant contamination risk | `app/src/api/client.ts:24`, `app/src/offline/storage.ts` |
| 9 | No `eas.json` — no build profiles or channels defined | `campaign-buddy-app/` |

Gap 4 is worth noting on its own: `app.json` and `package.json` already disagree
about the app's version today. Version discipline has to start with one generated
source of truth, or nothing downstream can be trusted.

---

## 10. Phasing

**Phase 0 — foundations, no user-visible change.** Unblocks everything else.
- One version source of truth; generate `app.json` and gradle values from it.
- `GET /v1/meta` with tenant, contract revision, `minSupported` / `recommended`,
  `features[]`, `limits`.
- App sends `X-CB-App-*` headers on every request; backend logs them.
- Contract snapshot committed + CI additive-only gate.

**Phase 1 — runtime tenancy.** The one-binary unlock.
- Slug as canonical tenant identity: validator (shape + reserved list), `aud`
  claim on staff JWTs, `tenants/*.yaml` registry, wildcard ingress.
- **Namespace secure-store keys and the offline queue by slug _before_ the base
  URL becomes runtime-configurable.** Ordering matters: until this lands there is
  a window where a queued mutation can flush to the wrong agency's server.
- Runtime `apiBaseUrl` derived from the slug, with a `/v1/meta` override; manual
  slug entry on the login screen; account switcher.
- Invite link / QR with deferred deep linking via `go.campaignbuddy.lk`.
- Managed app configuration last, and only on request (§11.1).
- No central directory — deferred per §2.4.

**Phase 2 — OTA.**
- `expo-updates`, fingerprint runtime versions, per-tenant channel from
  `/v1/meta`, staged rollout + rollback, `426` forced-upgrade gate and blocking
  screen.

**Phase 3 — push and fleet.**
- `expo-notifications`, device registry, central push relay, silent-push
  invalidation.
- Fleet dashboard in CB Office; MCP fleet tools; upgrade-readiness agent.

**Phase 4 — release trains.**
- Digest-pinned images, channel promotion, expand/contract migration policy,
  published compatibility window.

Phases 0 and 1 are the ones that must land before the first external agency is
onboarded. Phases 2–4 can follow while agencies are live, but Phase 2 should not
lag far — until OTA exists, every production fix costs a store review.

---

## 11. Decisions taken

1. **Tenant discovery — slug-primary, Slack's model** (§2). One slug identifies
   the tenant on every surface: subdomain, config filename, JWT `aud`, device
   storage namespace, OTA routing, invite link, support call. Resolution order is
   managed config → invite link/QR → manual slug entry. Central phone-number
   discovery is **deferred** (§2.4): once the invite link carries the slug almost
   nobody types it, which does not justify a central service holding a
   PII-derived index.
2. **OTA host — self-hosted on the existing VPS.** No dependency on whether Expo
   SDK 57 supports runtime channel override, and per-tenant bundle streams are
   certain to work. Removes the one unverified assumption in §4.1.
3. **Push credentials — central relay.** One rotatable secret, full audit trail,
   and an agency VPS breach cannot leak the APNs key or reach another tenant's
   devices.
4. **Drift policy — max two stable releases behind, contractually.** The
   compatibility window in §3.5 is therefore a real guarantee and the support
   matrix is finite: test app N against `stable`, `stable-1`, `stable-2`, `lts`.

### 11.1 Note on layer 1

Managed app configuration costs almost nothing to support and is the enterprise
default for company-owned devices -- but it is inert if promoters use their own
phones, which is the likely case here. Build it last within Phase 1, and only
once an agency asks for it.

The full resolution order and the reasoning behind it are in section 2.3.
