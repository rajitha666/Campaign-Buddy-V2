# Proposed charter amendment — two new block categories (DRAFT for the owner)

**Status:** proposal. The owner approved the *idea* on 2026-10-25 (specialists advise; the Product Owner may block on severe, evidenced architecture and accessibility findings). **Only the owner edits `docs/product-charter.md`** — agents never do. This file holds the exact text to paste and the follow-up code change, so the amendment is one reviewed step.

## 1. Edit to `docs/product-charter.md` §7 (owner)

In the **Block (hard)** table, add two rows after `scope_creep`:

```markdown
| `architecture_risk` | introduces a structural risk, backed by evidence from the code, that no other block category covers: a delete or cascade path that can erase recorded history; a non-additive migration with no rollback or expand/contract plan; a write route with no role, campaign-access or outlet-scope check; an unbounded query on a growing table in a hot path. Must name the file/line or command output that shows it. |
| `ux_accessibility` | makes a core flow unusable for a group of users, backed by a screenshot or measured value: a core action that cannot be reached by keyboard or screen reader; essential text below 4.5:1 contrast (3:1 for large text); content cut off or unreachable at 375 px; a destructive action with no confirmation and no undo. Cosmetic inconsistency, taste and below-target-but-compliant sizes are **advisory**, never a block. |
```

In the **Advise (comment only)** line nothing changes (`scale`, `cost`, `locale_hardcoding`, `simplicity`, `missing_tests_or_guides`, `other`).

Update the intro line of §7 only if wanted ("Only these categories block:" now lists seven) and bump *Last reviewed* at the top of the charter.

## 2. Follow-up code change (builder, after the owner applies §1)
The GitHub PO bot validates categories in code and says "keep in step with the charter":
- `product-owner-agent/lib/review.mjs`: add `'architecture_risk'` and `'ux_accessibility'` to `BLOCK_CATEGORIES` (and a test in `product-owner-agent/test/review.test.mjs` that each can carry `blocking: true`).
- `product-owner-agent/lib/claude.mjs` (prompt, line ~35): mention the two categories in the severity list.
- `.claude/agents/product-owner.md` already handles them conditionally: it applies them **only if the charter §7 it reads lists them**.
Do not make the code change before the charter edit lands, or the bot would block on categories the charter does not define.

## 3. Why this is safe
- Specialists never block; they mark a finding `suggest-block` with evidence. The Product Owner re-checks the evidence and decides, and only the owner can override (`po-override`), exactly as for the existing categories.
- Both categories require evidence and a recommended route (charter §7 last paragraph, §8), so "never block on taste" still holds.
- Proportionality: most changes still get a plain "endorsed".

## 4. If the owner declines or narrows it
The role files already treat the two names as `suggest-block` only; with no charter rows the Product Owner reports such findings as prominent advisories ("would block under the proposed amendment") and the owner decides each time.
