# Agent toolkit (zero-token helpers)

Plain Node, no dependencies, no AI. They do the mechanical work so review agents (and later the GitHub layer) only spend tokens on judgment.
Usage and rules: `docs/agent-team/roles.md` → "Efficiency toolkit".

| Script | Purpose |
|---|---|
| `review-brief.mjs` | reviewers a change needs + size by package + mechanical red flags + coverage gaps. `--merge <sha>` for a merged PR, `--major`, `--mode`, `--json` |
| `doc-section.mjs` | one section of a big markdown/HTML doc, or a heading index with token sizes |
| `quiet-run.mjs` | run a command, print counts and first failures only (full log to a temp file) |
| `fresh-stack.mjs` | isolated freshly seeded test DB + backend :4300 + portal :5173; **refuses any database not ending in `_test`** |
| `migration-lint.mjs` | data-loss / populated-table risks in migrations; exit 1 on danger |
| `soft-delete-lint.mjs` | backend reads of soft-deletable models with no deletedAt/archivedAt filter (heuristic) |
| `stale-wording.mjs` | UI labels a change removed that docs/guides/marketing still mention |
| `claim-impact.mjs` | marketing lines that mention given feature keywords (ledger first once `marketing/CLAIMS.md` exists) |
| `shoot.mjs` | screenshots + accessibility/layout checks at several widths (uses the portal's Playwright; run against `fresh-stack`). Windows Git Bash: pass routes without a leading slash |
| `claims-seed.mjs` | seed / re-sync `marketing/CLAIMS.md` from the marketing pages' headings without losing recorded status or evidence |
| `lib/` | pure logic, unit-tested in `test/` (`node --test scripts/agent/test/*.test.mjs`) |

Red flags are heuristics ("verify before reporting"), not verdicts.
