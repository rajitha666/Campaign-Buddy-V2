---
name: intake
description: Stage 0 of the delivery pipeline. Turn a pain point or idea into a well-formed story, have the Product Owner triage it (outcome, charter fit, risky/major), and create the GitHub issue once the owner approves. Use when the owner describes a problem or enhancement to work on, or says "intake" / "create a ticket for this".
disable-model-invocation: true
argument-hint: "<pain point, idea, or issue number>"
---

# /intake — pain point → triaged story

Keep it short and cheap; the pipeline and roles are in `docs/agent-team/roles.md`, the dials in `docs/agent-team/autonomy.yml`.

## 0. Mode and scope
Read `~/.campaign-buddy/team-mode.json` (missing = `full`). In `off` skip the Product Owner and just write the ticket. If this is a defect in the **Campaign Buddy product** found while building the agent team, file it as a bug ticket and stop (the agent-building chat does not fix product code).

## 1. Understand
Restate the **outcome** the owner needs (not the feature as worded) in one or two sentences. If a key fact is missing, ask one targeted question (AskUserQuestion), not a questionnaire. Search for duplicates first: `gh issue list --search "<keywords>" --state all --limit 10 --json number,title,state`.

## 2. Triage with the Product Owner (full, light)
Spawn the `product-owner` role (not general-purpose) with: the outcome, the candidate scope, and the question "charter fit, generic form, smallest change, and your read on **risky** and **major**". Risky/major definitions: `docs/agent-team/autonomy.yml`. Tag the **change profile** (what it touches: portal, app, backend, MCP, docs/marketing, infra) so later stages know which reviewers apply. If the PO objects, present its options to the owner before drafting.

## 3. Draft the story (repo conventions)
Title prefixed with the component (`[portal]`, `[backend]`, `[app]`, `[docs]`, `[infra]`). Body sections: Summary / user story, Why (evidence), Scope, Acceptance criteria (checkboxes), Technical notes (files, endpoints), Out of scope, Tests & verification, Dependencies, Open questions (owner decisions). Link the epic if there is one. Do **not** add `approved-for-build` or any `po:` label.

## 4. Owner approval, then create
Show the draft to the owner (title + the key parts, not a wall of text). Only after they approve, `gh issue create` with labels (`enhancement` / `bug`, `ux`, `epic` child as appropriate) and report the number and URL.

## 5. Close the stage
Say what comes next (Gate A: `/design <issue>`), and record the gate on the Team Console (`gates/<id>` → `not-started` for design) via `/team` conventions. Skip recording in `off` mode.
