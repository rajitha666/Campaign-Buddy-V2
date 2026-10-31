# Product charter — one-page digest (for specialist agents)

**This is a digest, not the source of truth.** `docs/product-charter.md` is. Read the full charter only if a finding touches
tenancy, privacy, a block category, or you are unsure; the Product Owner always reads it in full. Digest written 2026-10-25 from
the charter reviewed 2026-10-02.

**True north:** the system of record for in-store product activations in Sri Lanka. North star: share of activations run on the platform.
Levers: **onboardability** (a new agency self-serves), **field reliability** (works offline on cheap phones, never loses a day),
**data trust** (agencies and brands accept the numbers).

**Market model (decided 2026-10-02):** one **deployment per agency**, nothing shared across agencies (no shared multi-tenant DB; do not add an
`agencyId`/`tenantId` column spanning agencies). The agency is the customer of record. Sri Lanka (LKR, Asia/Colombo, +94, English) is the
default now — **defaults, not hard-codes**. Isolation risk now lives in anything *shared*: this repo's own agents/tools, MCP, any future central service.

**Scale target:** 5–10 deployments, ~2,000 promoters total; one VPS + one PostgreSQL per agency is enough. Don't ask for queues, sharding,
Kubernetes or a shared DB. Do reject designs that fall over at 10× one agency (unbounded lists, table scans, missing indexes, files on one disk with no backup).

**Six non-negotiables (a conflict is a hard block):**
1. Offline-first field use (check in/out, stock, sales, footfall work with no signal; old apps replay old payloads days later).
2. Strict tenant isolation (nothing crosses agencies, via any surface: APIs, reports, exports, file URLs, MCP, logs).
3. Low-end Android on patchy 3G (small payloads, light screens, compressed photos, few dependencies).
4. PDPA / staff privacy (location, national IDs, bank details, photos: stated purpose, minimum roles, retention policy).
5. Promoter simplicity (daily flow stays a handful of taps; complexity belongs in the portal).
6. Runs cheaply on a VPS (small team can operate it).

**Secondary (advise only):** Sinhala/Tamil readiness (no concatenated strings, no text in images, survive +40% width); Sri Lanka-native defaults.

**Decision rules, in order:** What outcome is really needed? Does it move the north star? Is there a generic form (config over bespoke code — generalise first)?
Does it hold the six? Survives 10× and cheap to run? Is it the smallest change?

**Known gaps to not widen:** G2 no client-version gate (API contract changes risk old apps) · G3 no API hardening (advisory) · G4 uploads on local disk, no backup story ·
G5 locale hard-coded (~30 files; add no more `LKR`/`Asia/Colombo`/`+94` literals) · G6 no i18n scaffolding · G7 privacy lifecycle undocumented (retention/deletion/audit) ·
G8 offline gaps (supervisor checklist, offline password login, supervisor route check-in/out — deferred by decision) · G9 backups/monitoring/restore drills unverified.

**What blocks** (only the Product Owner blocks; specialists `suggest-block`): `tenant_isolation`, `security_privacy`, `data_loss_offline`,
`breaks_shipped_clients`, `scope_creep`; plus `architecture_risk` and `ux_accessibility` once the owner amends charter §7 (decided 2026-10-25).
**Advise only:** `scale`, `cost`, `locale_hardcoding`, `simplicity`, `missing_tests_or_guides`, `other`. Never block on taste; a block needs a category,
plain-language impact and a recommended route.

**Owner override:** only the owner, via the `po-override` label; creates a `po:decision` follow-up issue; overrides become precedent.
