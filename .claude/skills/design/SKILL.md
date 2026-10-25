---
name: design
description: Stage 1 of the delivery pipeline. For an approved story, produce the technical design (Technical Architect) and/or UX spec (UX/UI Architect) in parallel, have the Product Owner confirm the outcome, and present one consolidated design for the owner's Gate A approval before any code is written. Use after intake, or when the owner says "design this" / "plan #N".
disable-model-invocation: true
argument-hint: "<issue number or story text>"
---

# /design — story → one approved design

Roles and routing: `docs/agent-team/roles.md`. Standards the designers check against: `docs/architecture.md` (+ `docs/adr/`) and `docs/portal-design.md`. Gate settings: `docs/agent-team/autonomy.yml`.

## 0. Mode and inputs
Read `~/.campaign-buddy/team-mode.json` (missing = `full`). `off`: no design review — write a short plan yourself and ask the owner to confirm. Fetch the story (`gh issue view <n> --json title,body,labels`). Decide the change profile from it: touches **backend/MCP/schema/sync** → Architect; touches **portal/app UI** → UX/UI; both → both. `light`: Architect only if the story is risky (see `autonomy.yml`), UX/UI only if major.

## 1. Brief the designers (parallel, one message)
Spawn the **defined role types** — never `general-purpose` — each in design/spec mode with: the story text (paste), the relevant guide sections by pointer (`node scripts/agent/doc-section.mjs <file> "<heading>"` — don't paste whole docs), the constraint "propose 1–3 options, recommend one, list risks and the test plan", and the output cap (≤400 words each).
- `technical-architect`: options, data/API changes, migration + shipped-client compatibility, offline impact, soft-delete/cascade review, test plan, ADR needed?
- `ux-ui-architect`: user goal, flow in numbered steps, layout hierarchy (text wireframe), every state (loading/empty/error/success), copy, accessibility notes, which existing components to reuse.

## 2. Product Owner confirms
Then spawn `product-owner` with the story and the specialists' proposals: does the recommended design deliver the outcome, hold the charter, and is it the smallest change? It decides conflicts and sets `risky`/`major` for the rest of the pipeline.

## 3. One consolidated design (short)
Present to the owner: the chosen approach in a few lines, key decisions and trade-offs, the **test plan**, what is **out of scope**, **risks** (esp. shipped-client compatibility, data loss), and the decisions only the owner can make. Under ~350 words. Never edit the charter or apply `po-override`.

## 4. Gate A
Per `autonomy.yml` (`A_design`): wait for the owner's approval. On approval, offer to post the design as a comment on the issue (outward-facing: ask first) and move to build (a git worktree, minimal TDD). Record `gates/<id>` (design → `approved`/`waiting-owner`) and the agent runs on the Team Console per `/team` conventions.
