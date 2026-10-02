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

If the model or API fails, the PR status is set to **error** (fail closed) with the message
*"Review failed — owner can add the po-override label to proceed."* The agent is never a way to
silently wave something through, and never a way to get stuck.

## Safety design

- **The judge can't be edited by the thing being judged.** The workflow checks out the *default
  branch*, so a PR that rewrites `docs/product-charter.md` or `product-owner-agent/` is still judged
  by the merged versions.
- Issue/PR text, diffs and comments are passed to the model as data; the system prompt tells it to
  ignore embedded instructions and treat deliberate attempts as a `security_privacy` finding.
- The bot only comments, labels, sets a status and opens `po:decision` issues. It never edits files,
  merges, or closes anything. Charter changes are the owner's (the subagent can *propose* them).
- Diffs are capped (100 kB total, 8 kB per file); a truncated view is stated in the prompt.

## One-time setup

1. **Secret** `ANTHROPIC_API_KEY` (already used by the triage and MCP-sync agents).
2. **Workflow permissions** — Settings → Actions → General → *Workflow permissions*: Read and write.
   (The workflow itself requests `issues`, `pull-requests`, `statuses` write.)
3. **Trial run** — Actions → *Product Owner Agent* → *Run workflow* with `dry_run: true` and a PR or
   issue `number`. Read the log; nothing is written.
4. **Make the block real** — Settings → Branches → protection rule for `main` → *Require status
   checks to pass* → add **`product-owner`**. Without this the red status is informational only.
   (Branch protection on private repos needs GitHub Team/Pro; on the free plan the status is
   visible but not enforced.)
5. Optional variable `PO_OVERRIDE_USERS` (comma-separated logins) if someone besides the repo owner may override.
6. The triage bot's PAT (`TRIAGE_GITHUB_TOKEN`) is what makes its summary comment trigger the PO —
   events created by the built-in token don't start workflows. The daily sweep catches anything missed.

## Tuning

- **The charter is the only knob for judgement.** Edit `docs/product-charter.md`, merge it, done —
  next review uses it. §6 (platform gaps) should be updated when a gap closes.
- Model: repo variable/env `PO_MODEL` (default `claude-opus-5`). Reviews are infrequent and the
  charter/docs prompt is cached, so cost is small; drop to a Sonnet model if it isn't.
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

The GitHub/Anthropic calls were exercised against a stubbed `fetch` (block, override). It has not run
against the live services yet — use the dry-run trial in step 3 first.
