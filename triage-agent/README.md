# Issue Triage Agent

Scheduled agent that triages open GitHub issues/enhancements on
`Campaign-Buddy-V2` three times a day: reviews new tickets against the
product docs, asks the creator clarifying questions when something's
ambiguous, and once it has enough information posts a structured
business/root-cause/proposed-changes summary for a human to approve.

Full design and rationale: [`docs/triage-agent-spec.md`](../docs/triage-agent-spec.md).

## How it decides what to do

State lives entirely as labels on the issue — there's no separate database.

| Label | Meaning |
|---|---|
| `triage:new` | not yet reviewed (also the implicit state of any unlabeled open issue) |
| `triage:needs-info` | bot asked clarifying questions, waiting on the creator |
| `triage:ready-for-review` | bot posted a full summary, waiting on you |
| `approved-for-build` | **you add this** once you approve the summary |
| `triage:in-build` | bot saw the approval label and handed off — terminal, agent stops touching the issue |
| `component:backend` / `component:portal` / `component:app` / `component:docs` / `component:infra` | which surface the bot thinks is affected |

Each run:
1. Lists all open issues.
2. Skips anything already `triage:in-build`.
3. If `approved-for-build` was just added, flips the issue to `triage:in-build` and posts a hand-off comment — no LLM call needed for this transition.
4. Otherwise, re-analyzes an issue only if it's unlabeled/`triage:new`, or it's `triage:needs-info`/`triage:ready-for-review` **and** someone other than the bot has commented since the bot's last comment. Otherwise it's left alone (still waiting).
5. Analysis = one Anthropic API call with the full `docs/*.md` bundle (prompt-cached across issues in the same run) plus the issue thread, asking for either clarifying questions or a full triage summary. Result is posted as a comment and reflected in the labels (and, if configured, the Projects v2 board).

## One-time setup

1. **PAT** — create a fine-grained GitHub PAT scoped to `Campaign-Buddy-V2` only, with `Issues: Read and write` + `Metadata: Read` (add `Projects: Read and write` if you're using the board below). Add it as the repo secret `TRIAGE_GITHUB_TOKEN`.
2. **Anthropic key** — add `ANTHROPIC_API_KEY` as a repo secret.
3. **(Optional) Projects v2 board** — create a user-owned Project v2, add a single-select field named exactly `Status` with options named exactly `New`, `Needs Info`, `Ready for Review`, `In Build`. Set the repo variable `TRIAGE_PROJECT_NUMBER` to the project's number (from its URL). Leave unset to skip board sync and use labels only — nothing else breaks if you skip this.
4. The workflow (`.github/workflows/triage-agent.yml`) is already scheduled 3x/day. First run will auto-create the labels above if they don't exist yet.

## Try it safely first

Run it once by hand from the **Actions** tab → *Issue Triage Agent* → *Run workflow*,
leaving **dry_run: true** (the default). It will read real issues and make real
Anthropic API calls (so it does cost tokens) but will only **log** the comments
and label changes it would make — nothing gets written to GitHub. Read the
Action's log output, and once it looks right, run it again with `dry_run: false`
to post for real. Only after that would you flip on trusting the schedule.

## Local dry run

```bash
cd triage-agent
cp .env.example .env   # fill in GITHUB_TOKEN / ANTHROPIC_API_KEY, keep DRY_RUN=true
npm run triage:dry
```

## Improving it

The prompt (`lib/claude.mjs`), comment templates, and label taxonomy
(`run.mjs`) are all editable in place — no build step. Since this is
LLM-in-the-loop and posts to a real, shared issue tracker, treat prompt
changes like any other product change: test with `DRY_RUN=true` against real
open issues before trusting a schedule change to post live.
