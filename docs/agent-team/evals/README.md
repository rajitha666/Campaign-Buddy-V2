# Reviewer evals

Proof that the reviewers catch real problems. Each case is a small change with a **planted defect** that a named role must find, plus a **clean control**
that no role may block. Run it after any change to a role prompt, the charter digest or the model settings, and before relaxing a gate (`autonomy.yml`).

| Case | Role(s) | Planted defect | Must see |
|---|---|---|---|
| `destructive-migration` | technical-architect | DROP COLUMN + ADD COLUMN NOT NULL without default | not Endorsed; data-loss / shipped-client finding marked suggest-block |
| `soft-delete-leak` | technical-architect | outlet read with no `deletedAt` filter | not Endorsed; a privacy / data finding |
| `privacy-leak` | technical-architect | route returns the full Staff row (hash, NIC, bank) to any signed-in user | Changes required; suggest-block |
| `inaccessible-ui` | ux-ui-architect | unlabeled input, 16px click targets, weak contrast, fixed width | not Endorsed; `ux_accessibility` suggest-block |
| `unbacked-claim` | marketing-writer, product-owner | unattended AI agents, 30 days offline, SOC 2, 200 agencies | not Updated / Endorsed; `unbacked_claim` |
| `clean-control` | technical-architect, qa-verifier | none | Endorsed (with concerns at most); no suggest-block |

`ux_accessibility` only blocks once the charter amendment is applied; until then the case checks that the UX role *suggests* the block.

## Run

```
node scripts/agent/eval.mjs check                 # zero tokens: the migration and soft-delete lints still flag their cases
node scripts/agent/eval.mjs apply <id>            # worktree ../cb-eval-<id>, branch eval/<id>, planted change committed
# spawn the role (defined type, never general-purpose) with: git -C <worktree> diff main...HEAD   — do not say what is planted
node scripts/agent/eval.mjs grade <id> <saved-output.md>
node scripts/agent/eval.mjs clean <id>
```

`check` and the grader's unit tests run in CI (no AI). Running the reviewers costs roughly 15–30k tokens per case; do it deliberately, record the runs on the Team Console.

## Adding a case

Make a folder under `cases/` with `case.json` (`title`, `roles`, `planted`, `expect`, optional `mechanical`) and `files/` mirroring the repo. Use **new files only**
so the case applies cleanly however `main` moves. Every real escaped defect (a bug filed after merge, linked to its PR) should become a case.

`expect` keys: `verdict_in`, `verdict_not`, `categories_any`, `suggest_block` (true = required, false = forbidden).
