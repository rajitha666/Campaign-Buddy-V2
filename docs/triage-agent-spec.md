# Issue Triage Agent

Scheduled agent (`triage-agent/`) that reviews every open GitHub issue on
`Campaign-Buddy-V2` three times a day, triages it against the product
documentation, asks the creator clarifying questions when something's
ambiguous, and — once it has enough information — posts a structured summary
for a human to approve before the ticket is treated as ready to build.

Runs as its own GitHub Actions workflow
(`.github/workflows/triage-agent.yml`), not as part of the backend, portal,
or app — it has no dependency on any of the three and needs no server to
keep running. Setup instructions: [`triage-agent/README.md`](../triage-agent/README.md).

## Why it's a separate service, not "an AI assistant posting live"

Posting comments and changing labels on a shared, real issue tracker is a
side-effecting, externally-visible action. An interactive coding-assistant
session (this one included) is expected to ask a human before taking actions
like that, every time — which is incompatible with "check in unattended 3x a
day." So the triage loop is its own small, auditable script with its own
credentials (a scoped GitHub PAT + an Anthropic API key), not something
driven live from a chat session. The one place a human stays firmly in the
loop is the approval gate below — nothing reaches `triage:in-build` without
a person deliberately adding a label.

## Pipeline

State lives entirely as labels on the issue (no separate DB table):

```
(unlabeled / triage:new)
        │  analyze
        ▼
triage:needs-info ──(creator replies)──► re-analyze
        │
        │  (enough info)
        ▼
triage:ready-for-review ──(you add approved-for-build)──► triage:in-build
```

- **`triage:new`** — not yet reviewed; also the implicit state of any open
  issue with no `triage:*` label yet.
- **`triage:needs-info`** — the agent asked up to 3 clarifying questions,
  each with a one-line "why I'm asking" aimed at the creator, and is waiting.
  A new reply from anyone other than the bot triggers re-analysis on the next
  run; no reply means it's left untouched.
- **`triage:ready-for-review`** — the agent posted a full triage summary
  (business context, root cause if it's a bug, proposed backend/portal/app
  changes, effort estimate, risks/assumptions) and is waiting on a human. A
  further human comment (pushback, correction) also triggers re-analysis.
- **`approved-for-build`** — added by a human reviewer once the summary looks
  right. This *is* the approval gate; the agent never adds it itself.
- **`triage:in-build`** — the agent saw the approval label, posted a hand-off
  comment, and stops touching the issue. Terminal state for this agent —
  actual implementation happens outside it (e.g. handed to a Claude Code
  session against this repo, same as the existing issue-fixing workflow —
  see `campaign-buddy-github-issues` history).
- **`component:backend` / `component:portal` / `component:app` /
  `component:docs` / `component:infra`** — applied alongside the stage label,
  inferred by the model (or from the `[component]` title prefix per the
  `AGENTS.md` issue naming convention).

## Analysis

One Anthropic Messages API call per issue that needs (re-)analysis. The
prompt includes the full `docs/*.md` bundle (all canonical specs — backend,
admin-panel, api, product-documentation, and the feature-specific specs;
`docs/archive/` is excluded as superseded) as a prompt-cached block, plus the
issue title/body and full comment thread. The model is instructed to act as
an expert product designer/PM for Campaign Buddy and return strict JSON:
either a `needs_info` result (question + rationale pairs) or a `ready`
result (the summary fields above). See `triage-agent/lib/claude.mjs` for the
exact system prompt and schema.

## Optional: Projects v2 board

If a repo variable `TRIAGE_PROJECT_NUMBER` is set, the agent also mirrors
each stage transition onto a GitHub Projects v2 board's `Status`
single-select field (`New` / `Needs Info` / `Ready for Review` / `In Build`).
This is a visual convenience only — labels remain the source of truth the
agent itself reads back, and any Projects API failure is logged and
swallowed rather than blocking the run.

## Out of scope (v1)

- Auto-creating a separate `[component]`-prefixed implementation issue on
  approval (today the same issue just gets relabeled `triage:in-build`).
- Notifications beyond the GitHub issue comment/label itself (no email/Slack
  digest).
- Multi-repo support — one `GITHUB_REPO` per run.
- Re-litigating an issue after it reaches `triage:in-build` (a human comment
  there is not picked back up by this agent).
- Cost controls beyond the docs prompt-caching (no per-run token budget or
  issue-count cap yet — worth adding if the open-issue count grows large).
