# License Usage Tracking

Per-campaign metering of licensed "seats" across the four user groups, with
weekly/monthly usage history and in-portal alerting. Soft limits only — going
over a cap never blocks an assignment, it only changes the reported alert state.

## Metering model

Each campaign carries four seat caps (columns on `Campaign`, defaults in
parentheses):

| Group | Cap column | Default | Counted as "used" |
|---|---|---|---|
| Promoter | `licensePromoterCap` | 20 | distinct promoter `Staff` on an `Activation` in the campaign |
| Supervisor | `licenseSupervisorCap` | 5 | distinct **person** who is a supervisor `Staff` on an `Activation` (either slot) **or** a portal `User` with role `supervisor` holding a `CampaignAccessGrant` — de-duped across the two via `Staff.linkedUserId` |
| Admin | `licenseAdminCap` | 2 | distinct portal `User` with role `adm` or `usr` holding a grant on the campaign |
| Sponsor | `licenseSponsorCap` | 2 | distinct portal `User` with role `sponsor` holding a grant on the campaign |

A seat is "used" as soon as the account is **assigned** — provisioning is the
cost; login or activity is irrelevant. All four groups count, sponsor-org users
included.

`Campaign.licenseWarnThresholdPct` (nullable) is the per-campaign "near limit"
threshold as a percent of cap. When null, the global default applies
(`LICENSE_WARN_THRESHOLD_PCT` env var, itself defaulting to 80).

### Alert state per group

- `ok` — under the warn threshold
- `warn` — at or above `ceil(warnPct% × cap)`, still under cap
- `at` — exactly at cap (cap > 0)
- `over` — above cap

The campaign's `overallState` is the worst of its four groups.

## Usage over time — `CampaignLicenseUsageSnapshot`

A daily in-process job (`src/jobs/licenseSnapshot.ts`, node-cron, 00:15
Asia/Colombo, plus a catch-up run on server boot) writes one row per campaign per
period for the current **week** (ISO Mon–Sun) and **month**. Each `*Used` value
is the **peak** seen for that group during the period — a later dip never lowers
it, so a mid-period replacement reads as one concurrent seat. `*Cap` is the cap
as configured at capture time, so historical rows stay meaningful after a cap
changes.

Periods are bucketed in Asia/Colombo (fixed UTC+05:30); `periodStart` is stored
as a `@db.Date` at UTC-midnight, consistent with the rest of the schema.

Set `LICENSE_SNAPSHOT_DISABLED=1` to turn the job off. It is wired from
`server.ts` only, so importing the Express app in tests never starts a timer.

## API (`/admin/v1`)

| Method + path | Access | Purpose |
|---|---|---|
| `GET /campaigns/:id/license` | `adm`, `usr` (+ campaign grant) | current usage vs caps, per-group + overall state |
| `PATCH /campaigns/:id/license` | `adm` only | set the four caps and/or `warnThresholdPct` (null clears the override) |
| `GET /campaigns/:id/license/history?period=week\|month&limit=` | `adm`, `usr` (+ campaign grant) | stored snapshots, newest first |
| `GET /license/usage?state=warn\|at\|over` | `adm`, `usr` | account-wide rollup; `adm` sees all campaigns, `usr` sees granted ones; `state` filters to that severity or worse |

`GET .../license` and `/license/usage` rows share the shape:

```jsonc
{
  "campaignId": "...", "campaignNo": "CMP-0001", "campaignName": "...",
  "status": "active",
  "warnThresholdPct": 80, "warnThresholdIsDefault": true,
  "overallState": "ok",
  "groups": [
    { "group": "promoter", "used": 1, "cap": 20, "pct": 5, "state": "ok" },
    // supervisor, admin, sponsor …
  ]
  // /license/usage rows also carry "clientName"
}
```

## Portal

**CB Office → Admin → License Usage** (`/license`, admin personas only):

- Per-campaign panel for the campaign selected in the top bar — four group cards
  (used / cap, usage bar, state badge), overall badge, and a weekly/monthly
  snapshot table.
- **Edit caps** button (Super Admin / `adm` only) — modal with the four cap
  inputs and the warn-threshold override.
- **All campaigns** table — every accessible campaign with per-group used/cap and
  overall state, filterable to "near limit or worse" / "over limit only".

## Out of scope (v1)

Hard limits / blocking assignment; agency-level shared seat pools; email or
off-platform notifications; sponsor/supervisor visibility of usage; seat-days or
cumulative-distinct-person metering.
