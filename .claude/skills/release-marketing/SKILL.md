---
name: release-marketing
description: Stage 5 of the delivery pipeline, for MAJOR changes only. Find the marketing claims a change touches, have the Marketing writer update the capability brief, landing page, deck and the claims ledger, have the Product Owner check every claim has evidence, and present the result for Gate D. Use after a major change merges, or when the owner says "update marketing for this".
disable-model-invocation: true
argument-hint: "<feature keywords> [--merge <sha>]"
---

# /release-marketing — say only what we ship

Strict rule (owner, 2026-10-25): **no claim without a shipped feature and evidence; no "coming soon".** Ledger and rules: `marketing/CLAIMS.md`. Role: `.claude/agents/marketing-writer.md`.

## 0. Is this major? Mode?
Major = anything a client or prospect would notice (new capability, new menu/page/flow, pricing/licensing, big behaviour change; see `docs/agent-team/autonomy.yml`). If it is not major, say so and stop — don't churn marketing for polish or bug fixes. Read `~/.campaign-buddy/team-mode.json` (missing = `full`): in `light`/`off` run this only if the owner asks.

## 1. Find the affected claims (no AI)
- `node scripts/agent/claim-impact.mjs <keywords>` → ledger rows and page lines that mention the feature (ledger first).
- `node scripts/agent/claims-seed.mjs` → shows new or vanished page sections vs the ledger.
- Pull the shipped facts: the merged PR/diff and the updated product docs (`node scripts/agent/doc-section.mjs docs/product-documentation.md "<heading>"`). Marketing may only claim what is on `main` and documented.

## 2. Spawn the Marketing writer (real role type)
Give it: the keywords, the affected ledger rows and lines, the shipped facts (pointers, not whole docs), and the scope (`marketing/` except `marketing/training/`). It updates the capability brief, landing page and deck consistently, retires or rewrites contradicted claims, adds/updates ledger rows with evidence, runs `claims-seed --write` if headings changed, and returns **Updated / Missing / No change needed** plus a **Claims for PO check** list. Owner-supplied items (contact, pricing) stay marked placeholders.

## 3. Product Owner checks the claims
Spawn `product-owner` with the claims list: each must have evidence in `CLAIMS.md`; unbacked claims go back to the writer (not a charter block). Raw claims the change makes **false** (a number, a frequency, a behaviour) must be fixed in the same pass — e.g. the GPS ping interval after the battery change.

## 4. Gate D
Per `autonomy.yml` (`D_marketing`): present the changed files, ledger movement (verified/contradicted counts) and anything needing the owner (pricing, contact, screenshots). On approval, commit as a marketing PR. Record the run and gate on the Team Console per `/team` conventions. Marketing *copy* defects found in the live pages (not the agent's own output) become bug tickets for another chat.
