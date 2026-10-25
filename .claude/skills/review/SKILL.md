---
name: review
description: Run the agent team's review of a change cheaply and consistently. Builds a compact review brief, spawns only the reviewers the change needs (in parallel, brief embedded), consolidates the verdicts, and records the runs on the Team Console. Use before declaring a change ready to merge, or when the owner says "review this" / "run the team on this".
disable-model-invocation: true
argument-hint: "[base] [head] | --merge <sha> [--major]"
---

# /review — brief → right reviewers → one consolidated verdict

Goal: the independent review the design calls for, at the lowest token cost. Roles and contract: `docs/agent-team/roles.md`.

## 1. Mode first
Read `~/.campaign-buddy/team-mode.json` (missing = `full`). **`off`**: say "team mode is off — skipping agent review", run the automatic checks only (step 5), and stop. **`light`** and **`full`**: continue; the brief already trims the reviewer list for the mode.

## 2. Build the brief (no AI)
`node scripts/agent/review-brief.mjs $ARGUMENTS` — run it in the worktree that holds the change (`--cwd <worktree>` if you are elsewhere). Default range is `main...HEAD`; for an already-merged PR use `--merge <sha>`. Add `--major` when the change is something a client or prospect would notice. Read the brief; if its red flags show a clear block-category risk (charter §7), plan to tell the owner in one line either way.

## 3. Spawn only what the brief says
From the brief's **Needs:** line, launch the listed specialists **in one message, in parallel** (`technical-architect`, `ux-ui-architect`, `qa-verifier`, `docs-enablement`, `marketing-writer`). Give each only:
- the brief (paste it), the story/acceptance criteria (a few lines or the issue number), the worktree path and diff command;
- for UX/UI: screenshot paths if any (otherwise it will say "visual review not done");
- for QA: the packages touched and the instruction to use `fresh-stack` and `quiet-run`.
Do **not** paste the diff or whole files. Then run `product-owner` last (full mode: always; light mode: yes) with the specialists' verdicts so it can consolidate and decide on blocks. Always spawn the **defined role types** by name (never `general-purpose`: it carries every tool definition on every turn and cost ~5× more in measurement). Use the models defined in their files; don't override upward. For a risky change (the brief shows route/schema/auth/sync flags) tell the architect to go deeper on the named files.

When the brief shows them, give reviewers the matching leads first: migration flags → `migration-lint`; backend reads → `soft-delete-lint`; UI changes → bring up `fresh-stack`, run `shoot` on the changed routes and pass the screenshot paths to `ux-ui-architect`; removed labels → `stale-wording`; major change → `claim-impact` for marketing. Tear the stack down afterwards.

## 4. Consolidate (short)
Reply with: one line per role (verdict + one-sentence TL;DR), then the **required changes** merged and de-duplicated, then **needs owner decision**, then which **owner gate** is next (design A / merge B / docs C / marketing D) per the autonomy settings. Under 250 words unless something is blocked. Never apply `po-override`; never edit the charter.

## 5. Automatic checks (always, any mode)
`node scripts/agent/quiet-run.mjs --cwd <package> -- <test command>` for each package touched (portal `npx vitest run`, app `npm test` + `npm run typecheck`, backend `npm test`, MCP `npm test`); e2e through `node scripts/agent/fresh-stack.mjs up` then `quiet-run … npx playwright test`, then `fresh-stack down`. Report counts only.

## 6. Record and guard
Use `/team` conventions: batch-write the runs to the Team Console, snapshot usage, and if the 5-hour limit is ≥70% ask the owner whether to go `light` or `off`.
