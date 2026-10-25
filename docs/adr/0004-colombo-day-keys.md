# ADR-0004: Business days are Asia/Colombo; date columns are keyed by UTC-midnight

- **Status:** Accepted as implemented (recorded retrospectively 2026-10-25 from `campaign-buddy-backend/src/utils/dates.ts` and `campaign-buddy-portal/src/lib/colomboDay.js`)
- **Decided by:** owner (as built); locale generalisation is charter G5

## Context
Sri Lankan business days (UTC+5:30, no DST) do not line up with the server's UTC day for five and a half hours each night. Prisma `@db.Date` reads back as UTC-midnight.

## Decision
"Today" is the Colombo calendar day (`colomboYmd()`, `dayDate()`); `@db.Date` filters always use a UTC-midnight `Date`. Never derive "today" from `new Date().toISOString()`. Portal and app mirror this (`colomboDay.js`). New `Asia/Colombo` / `LKR` / `+94` literals should become campaign/agency settings (`Campaign.timezone` already exists).

## Consequences
Correct day grouping for attendance, sales and reports. Demo seeding between 00:00 and 05:30 Colombo lands "today" on yesterday (known gotcha in `marketing/training/MAINTENANCE.md`). Supporting another market needs per-agency timezone, currency and phone region (charter §2 "defaults, not hard-codes").

## Alternatives considered
Store local timestamps: rejected (offset ambiguity). Use UTC days everywhere: rejected (wrong business day for a third of the night).
