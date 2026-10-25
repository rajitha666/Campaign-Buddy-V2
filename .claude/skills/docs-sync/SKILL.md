---
name: docs-sync
description: Stage 4 of the delivery pipeline. After a change is built (or in the same PR), find every document, user guide and screenshot it makes stale, have Docs & enablement update them, and present the result for Gate C. Use when behaviour, UI, API or setup changed and docs must follow, or when the owner says "sync the docs".
disable-model-invocation: true
argument-hint: "[base head | --merge <sha>]"
---

# /docs-sync — make every doc true again

Rules and doc map: `.claude/agents/docs-enablement.md`, `marketing/training/MAINTENANCE.md`. The cost-saving tools are in `scripts/agent/`.

## 0. Mode
Read `~/.campaign-buddy/team-mode.json` (missing = `full`). `light`/`off`: don't spawn the docs agent unless the owner asks; instead keep guides in sync yourself per `AGENTS.md` ("Keep the user guides in sync") and say so in one line.

## 1. Find what is stale (no AI)
Run from the worktree holding the change:
- `node scripts/agent/review-brief.mjs $ARGUMENTS` → read its **coverage** lines (UI changed but no guide changed; routes changed but `api-spec.md` / MCP `coverage.json` unchanged).
- `node scripts/agent/stale-wording.mjs $ARGUMENTS` → removed UI labels that docs, guides or marketing still mention.
If both are clean and the brief shows no user-visible change, report "No change needed" with the reason and stop.

## 2. Spawn Docs & enablement (one agent, real role type)
Give it: the brief, the stale-wording hits, the story/acceptance criteria, the worktree path, and the instruction to edit only documentation (`docs/`, `marketing/training/`, READMEs, `docs/physical-device-tests.md`). For UI changes tell it to re-shoot affected screenshots with the capture harness against `node scripts/agent/fresh-stack.mjs up`, or list the stale ones by filename under **Missing** if it cannot. Remind it: never put logins in docs; don't re-seed the demo between 00:00 and 05:30 Colombo.

## 3. Verify, then present
Re-run `stale-wording` — it must come back clean. Present the verdict (**Updated / Missing / No change needed**), the files changed in a few lines, and anything the owner must supply. Flag anything for the Marketing writer if the change is major (next: `/release-marketing`). Mobile changes with device-only risk: confirm `docs/physical-device-tests.md` gained its checks.

## 4. Gate C
Per `docs/agent-team/autonomy.yml` (`C_docs`): wait for the owner's approval, then commit the doc changes with the code PR (or as a follow-up PR). Record the run and gate on the Team Console per `/team` conventions.
