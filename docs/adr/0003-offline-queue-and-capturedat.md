# ADR-0003: Offline queue with ordered replay and a bounded `capturedAt` trust rule

- **Status:** Accepted as implemented (recorded retrospectively 2026-10-25 from `campaign-buddy-app/src/offline/queue.ts`, `campaign-buddy-backend/src/utils/clientTime.ts` and `utils/salesGuards.ts`)
- **Decided by:** owner (as built, issue #77)

## Context
Promoters work in basements without signal (charter §4.1-1). Actions must sync later without loss or duplication, but a phone's clock can't be trusted.

## Decision
The app queues field actions and replays them in order `checkIn → (stats, salesSummary, productStock) → salesConfirm → checkOut`; network failures and 408/429/5xx retry with backoff (max 8 attempts); **401 pauses the queue until the session refreshes**; any other status is permanent (the server refused it). The app sends `capturedAt` **only** for queued actions. The server trusts it only if valid, not more than 2 minutes in the future, and on the **same Colombo day** as now; otherwise it uses server time. For sales writes, `requireOpenShift` (`utils/salesGuards.ts`) accepts a write on a shift that closed meanwhile (check-out or auto-checkout) when `capturedAt` falls inside [check-in, check-out].

## Consequences
Offline work is safe and ordered; a wrong clock can't re-date attendance. Old app versions replay old payloads days later, so API changes need a compatibility path (charter G2: no version gate yet). `capturedAt` is client-supplied within a bound, so it is forgeable in principle (no audit flag stored). Native modules mean app changes may need a rebuild and device tests.

## Alternatives considered
Offline password login and offline supervisor checklist: deferred by owner decision (charter G8).
