# Product Owner Agent

The final approver before the owner. It holds the product's true north
([`product-charter.md`](product-charter.md)), reads every proposed issue and pull request against
it, and either endorses the change or **blocks it with the impact, the outcome the requester
actually needs, and a recommended route to that outcome.** The owner can override in one step.

Two forms, one charter:

| Form | Where | When |
|---|---|---|
| **Bot** — `product-owner-agent/` + `.github/workflows/product-owner-agent.yml` | GitHub Actions | Unattended, on issue triage results and every PR, plus a daily backstop sweep. |
| **Subagent** — `.claude/agents/product-owner.md` | Claude Code sessions | Before building, and before calling a change ready. Same rules, no API cost. |

The bot is a small zero-dependency Node script in the same style as the triage agent.

## Where it sits

```
issue ──► triage bot ──► triage:ready-for-review ──► PO agent ──► po:endorsed ─┐
                                                        │                      ├─► you add approved-for-build ─► triage:in-build
                                                        └─► po:objection ──────┘   (held until endorsed or po-override)

PR ─────────────────────────────────────────────────► PO agent ──► commit status `product-owner`
                                                                    success = endorsed / concerns / overridden
                                                                    failure = blocked    (required check ⇒ can't merge)
```

- **Gate 1 — issues.** After the triage bot posts its summary, the PO reviews it. `po:endorsed` or
  `po:objection` is applied. The triage bot **holds** `approved-for-build` (does not move to
  `triage:in-build`) until the issue is `po:endorsed` or carries `po-override`.
- **Gate 2 — pull requests.** Every non-draft PR gets a `product-owner` commit status and a single
  review comment (edited in place, not spammed). Re-reviewed on each push.

## Verdicts and blocking

| Verdict | Meaning | Effect |
|---|---|---|
| ✅ Endorsed | Fits the charter. | Green. |
| ⚠️ Endorsed with concerns | Fits; advisory notes worth reading. | Green. |
| ❌ Blocked | A hard-block finding. | Red status / `po:objection`; `approved-for-build` held. |

Only five categories can block (charter §7): `tenant_isolation`, `security_privacy`,
`data_loss_offline`, `breaks_shipped_clients`, `scope_creep`. Code enforces this — a "block" whose
findings are advisory-only categories, or that lacks an underlying need, a single recommended
option, and an urgent-path note, is rejected and the model is asked once to fix it. A verdict that
still fails validation is treated as an error (below), never as a pass.

## What an objection looks like

TL;DR · Impact (who / what goes wrong / how big) · Charter principle and evidence · The outcome
we're actually after · Options table (effort, what each still delivers, one ⭐ recommended, a
smallest-safe-version where the full ask is blocked) · "Need this now?" with the override.

## Override — for urgent needs

Add the **`po-override`** label to the PR or issue.

- Immediate: the status goes green / the issue is released. No reason needed.
- **Owner only.** The agent reads the label's audit trail and honours it only if the person who
  applied it is in `PO_OVERRIDE_USERS` (default: the repository owner). A bot or collaborator adding
  it does nothing.
- Recorded: the agent opens a `po:decision` issue with the objection and a follow-up checklist, and
  comments a link. Add a one-line reason there if you want it remembered.
- Sticks for the life of the PR/issue until you remove the label — later pushes stay green.
- Overrides are **precedent**: recent `po:decision` issues are fed to the agent so it doesn't
  re-raise a settled objection.

Other commands (owner only, as a comment): `/po review` — look again now (e.g. after you answered a question or changed the charter).
Replying to a `po:objection` issue also triggers a fresh look.

## Failure behaviour

If the `claude` CLI isn't installed, the OAuth token is missing/expired, or the model's answer fails
validation twice in a row, the PR status is set to **error** (fail closed) with the message *"Review
failed — owner can add the po-override label to proceed."* The agent is never a way to silently wave
something through, and never a way to get stuck.

## Safety design

- **The judge can't be edited by the thing being judged.** The workflow checks out the *default
  branch*, so a PR that rewrites `docs/product-charter.md` or `product-owner-agent/` is still judged
  by the merged versions.
- Issue/PR text, diffs and comments are passed to the model as data; the system prompt tells it to
  ignore embedded instructions and treat deliberate attempts as a `security_privacy` finding.
- The bot only comments, labels, sets a status and opens `po:decision` issues. It never edits files,
  merges, or closes anything. Charter changes are the owner's (the subagent can *propose* them).
- Diffs are capped (100 kB total, 8 kB per file); a truncated view is stated in the prompt.

## Billing & authentication — decided 2026-10-02

Unlike the triage and MCP-sync agents (which call the Messages API directly with `ANTHROPIC_API_KEY`,
pay-per-token Console billing), the PO agent gets its verdicts by shelling out to the local **`claude`
CLI** (`lib/claude.mjs`), authenticated against the **owner's Claude Pro/Max subscription** via a
long-lived OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token`) rather than a Console API
key. This was a deliberate owner choice over a small API-credit top-up, made with a known trade-off
spelled out up front:

- **Why:** draws from usage already paid for, instead of a new metered balance.
- **The catch:** Claude Code's subscription-OAuth terms are written for the subscriber's own "ordinary
  use," and caution against "routing requests through...credentials on behalf of" other users. The PO
  agent reacts to *any* issue or PR on the repo, not just ones the owner authors — today that's a
  non-issue because the owner is the repo's sole contributor, but it stops being clearly fine the
  moment anyone else opens an issue or sends a PR here.
- **Revisit when:** a second contributor shows up. At that point, switch `lib/claude.mjs` back to a
  Messages-API call with `ANTHROPIC_API_KEY` (it's the `review()` function's only real dependency —
  `github.mjs`, `review.mjs` and everything else are unaffected either way), or get Anthropic's
  sign-off for the shared-repo case first.
- The CLI call carries no tool access (`--tools ""`, `--bare`, `--permission-mode dontAsk`) — it's a
  pure text completion over the prompt it's given on stdin, nothing more.

## One-time setup

1. **Generate the token.** Locally, logged into the Pro/Max account: `claude setup-token`. It prints a
   long-lived (1-year) token starting `sk-ant-oat01-...`. Copy it immediately — it's shown once.
2. **Secret** — add it as `CLAUDE_CODE_OAUTH_TOKEN` at
   `github.com/<owner>/<repo>/settings/secrets/actions`. (The triage and MCP-sync agents separately
   need `ANTHROPIC_API_KEY`, unaffected by this.)
3. **Workflow permissions** — Settings → Actions → General → *Workflow permissions*: Read and write.
   (The workflow itself requests `issues`, `pull-requests`, `statuses` write.)
4. **Trial run** — Actions → *Product Owner Agent* → *Run workflow* with `dry_run: true` and a PR or
   issue `number`. Read the log; nothing is written.
5. **Make the block real** — Settings → Branches → protection rule for `main` → *Require status
   checks to pass* → add **`product-owner`**. Without this the red status is informational only.
   (Branch protection on private repos needs GitHub Team/Pro; on the free plan the status is
   visible but not enforced.)
6. Optional variable `PO_OVERRIDE_USERS` (comma-separated logins) if someone besides the repo owner may override.
7. The triage bot's PAT (`TRIAGE_GITHUB_TOKEN`) is what makes its summary comment trigger the PO —
   events created by the built-in token don't start workflows. The daily sweep catches anything missed.

## Tuning

- **The charter is the only knob for judgement.** Edit `docs/product-charter.md`, merge it, done —
  next review uses it. §6 (platform gaps) should be updated when a gap closes.
- Model: repo variable/env `PO_MODEL` (default `claude-opus-5`, also accepts aliases like `sonnet`).
  Since billing is the subscription's included usage rather than per-token, cost isn't the reason to
  change it — a lighter model only matters if subscription usage/rate limits become the constraint.
- Which categories block: `BLOCK_CATEGORIES` in `product-owner-agent/lib/review.mjs` **and** charter §7 — keep both in step.

## Out of scope (v1)

- Auto-editing the charter or a decision log file (decisions live as `po:decision` issues instead).
- Reviewing the *resulting behaviour* of a change (running the app). It judges intent and diff.
- Multi-repo, Slack/email notifications.
- Learning beyond precedent: the agent doesn't fine-tune itself; consistency comes from the charter plus decisions.
- Backfilling: existing open PRs are picked up by the first sweep; older merged work is not re-judged.

## Tests

```bash
cd product-owner-agent && npm test   # verdict validation, comment format, override authority, diff packing
```

Unit-tested: verdict validation, comment formatting, override authority, diff packing, and the pure
prompt/CLI-response-parsing functions in `lib/claude.mjs` (`buildPrompt`, `extractResultText`,
`parseVerdictJson`). The GitHub-writing side was exercised against a stubbed `fetch` (block, override
scenarios); the `claude` CLI spawn/stdin/stdout/retry path was exercised against a fake CLI binary
(block, endorse, retry-on-invalid-verdict, and three failure modes — nonzero exit, an `is_error`
envelope, and non-JSON stdout — all correctly raised and would surface as a failed-closed `error`
status). It has not run against the real `claude` CLI, a real OAuth token, or live GitHub yet — use
the dry-run trial in setup step 4 first.
