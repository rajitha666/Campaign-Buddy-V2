# ADR-0003: Offline queue with ordered replay and a bounded `capturedAt` trust rule

- **Status:** Accepted as implemented (recorded retrospectively 2026-10-25 from `campaign-buddy-app/src/offline/queue.ts` and `campaign-buddy-backend/src/utils/clientTime.ts`)
- **Decided by:** owner (as built, issue #77)

## Context
Promoters work in basements without signal (charter §4.1-1). Actions must sync later without loss or duplication, but a phone's clock can't be trusted.

## Decision
The app queues field actions and replays them in order `checkIn → (stats, salesSummary, productStock) → salesConfirm → checkOut`; transient 5xx/429/401 retry with backoff (max 8 attempts), only 4xx fails hard. The app sends `capturedAt` **only** for queued actions. The server trusts it only if valid, not more than 2 minutes in the future, and on the **same Colombo day** as now; otherwise it uses server time. A write for a shift that auto-closed meanwhile is accepted if `capturedAt` falls inside the shift window.

## Consequences
Offline work is safe and ordered; a wrong clock can't re-date attendance. Old app versions replay old payloads days later, so API changes need a compatibility path (charter G2: no version gate yet). `capturedAt` is client-supplied within a bound, so it is forgeable in principle (no audit flag stored). Native modules mean app changes may need a rebuild and device tests.

## Alternatives considered
Offline password login and offline supervisor checklist: deferred by owner decision (charter G8).
