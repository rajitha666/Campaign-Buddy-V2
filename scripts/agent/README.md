# Agent toolkit (zero-token helpers)

Plain Node, no dependencies, no AI. They do the mechanical work so review agents (and later the GitHub layer) only spend tokens on judgment.
Usage and rules: `docs/agent-team/roles.md` → "Efficiency toolkit".

| Script | Purpose |
|---|---|
| `review-brief.mjs` | reviewers a change needs + size by package + mechanical red flags + coverage gaps. `--merge <sha>` for a merged PR, `--major`, `--mode`, `--json` |
| `doc-section.mjs` | one section of a big markdown/HTML doc, or a heading index with token sizes |
| `quiet-run.mjs` | run a command, print counts and first failures only (full log to a temp file) |
| `fresh-stack.mjs` | isolated freshly seeded test DB + backend :4300 + portal :5173; **refuses any database not ending in `_test`** |
| `lib/` | pure logic, unit-tested in `test/` (`node --test scripts/agent/test/*.test.mjs`) |

Red flags are heuristics ("verify before reporting"), not verdicts. Not built yet: `stale-wording`, `claim-impact`, `shoot`, `migration-lint`, `soft-delete-lint`.
