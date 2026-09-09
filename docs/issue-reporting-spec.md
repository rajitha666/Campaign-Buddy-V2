# Portal Issue Reporting → GitHub Issues

Lets a portal admin file a bug, enhancement request, or question from inside CB
Office. Each report is stored in the backend database and — when the GitHub
integration is configured — mirrored to an issue in the project repository.

## Who can use it

Super Admin (`adm`) and Campaign Admin (`usr`) only. The "🐞 Report issue"
button in the top bar is hidden for the supervisor and sponsor personas, and the
API rejects them with `403 READ_ONLY_ROLE` regardless of client.

## Data model

New model `IssueReport` (migration `20260909003626_add_issue_reports`, table
`issue_reports`):

| Field | Notes |
|---|---|
| `title` / `body` | free text; validated 4–160 / 10–8000 chars |
| `category` | `bug` \| `enhancement` \| `question` (default `bug`) |
| `severity` | `low` \| `normal` \| `high` \| `critical`; set only for `bug` (defaults to `normal`), `null` otherwise |
| `context` | JSON blob captured client-side: `page`, `persona`, `campaignName`, `portalVersion`, `userAgent`. No PII beyond the reporter's display name. |
| `reporterUserId` / `reporterName` | FK to `users` + a name snapshot (survives user rename/delete in the issue body) |
| `syncStatus` | `pending` → `synced` \| `failed` |
| `githubIssueNumber` / `githubIssueUrl` | set on success |
| `syncError` | last failure message (cleared on success) |
| `syncAttempts` / `lastAttemptAt` | retry bookkeeping; job stops at 8 attempts |

## Endpoints (`/admin/v1`, roles `adm` + `usr`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/issue-reports` | File a report. Persists, then attempts the GitHub push inline (best-effort). Returns `201` with the row. |
| `GET` | `/issue-reports?limit=` | List reports, newest first (default 50, max 200). `meta.integration` = `{ enabled, configured, repo }`. |
| `POST` | `/issue-reports/:id/retry` | Re-attempt the GitHub push for one row. |

## GitHub integration

`src/utils/githubIssues.ts` calls `POST /repos/{owner}/{repo}/issues` with the
built-in `fetch` (Node ≥ 18). Config (env — see `.env.example`):

| Var | Default | Meaning |
|---|---|---|
| `GITHUB_ISSUES_ENABLED` | `0` | `1` to actually call GitHub |
| `GITHUB_ISSUES_REPO` | — | `owner/repo` (e.g. `rajitha666/Campaign-Buddy-V2`) |
| `GITHUB_TOKEN` | — | fine-grained PAT, **Issues: Read and write** on that repo |
| `GITHUB_ISSUES_DEFAULT_LABELS` | `portal,from-portal` | applied to every issue |
| `GITHUB_API_URL` | `https://api.github.com` | override for GitHub Enterprise |
| `ISSUE_SYNC_DISABLED` | `0` | `1` disables the retry job |

Integration is "configured" only when `ENABLED=1` **and** a token and a
well-formed repo are set. Until then every report simply stays `pending` — no
data is lost.

**Issue shape:** title gets a `[portal]` prefix (per `AGENTS.md` naming
convention) unless it already has a `[component]` prefix. Labels =
default labels + the category name (`bug` / `enhancement` / `question`). Body =
the reporter's text, then a `---` rule, then a metadata block (reporter +
persona, category/severity, portal page, campaign, portal version, user agent,
submitted-at) and a "Filed from the Campaign Buddy office portal." footnote.

## Retry job

`src/jobs/issueSync.ts` — node-cron, hourly on the hour + a catch-up run on
boot. Picks up `pending` / `failed` rows with `< 8` attempts and re-pushes them.
Wired from `server.ts` only (never `app.ts`, so tests don't spawn a timer).
No-op while the integration is not configured.

## Portal surface

- **Top bar button** (`ReportIssueModal.jsx`) — category + severity chips, title,
  description, and a read-only preview of the auto-captured context. On success
  the toast shows the issue number when one came back.
- **Issue Reports page** (`/issues`, Admin nav) — table of filed reports with
  status badges, a link to the GitHub issue when synced, a "Retry sync" button
  for stuck rows, and a banner describing the current integration state.

## Out of scope (v1)

Editing/closing issues from the portal, comment sync-back, attachments/screenshots,
reporting for supervisor/sponsor personas, per-campaign routing to different repos.
