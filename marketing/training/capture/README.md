# Training screenshot capture

Playwright scripts that re-shoot `marketing/training/assets/**` against a
locally running, demo-seeded stack. Committed so a re-shoot is one command
instead of a from-scratch Puppeteer script — see the note in `../MAINTENANCE.md`.

## Setup

```bash
cd marketing/training/capture
npm install
```

`playwright` is pinned to the same version already used by
`campaign-buddy-portal`/`campaign-buddy-app`'s e2e suites, so `npm install`
reuses the Chromium build already cached by those projects instead of
downloading a new one. If this is the very first Playwright install on the
machine, run `npx playwright install chromium` once.

## Prerequisites

1. Seed the demo dataset the shots are taken against (from `campaign-buddy-backend`):
   ```bash
   npm run prisma:seed && npx ts-node prisma/demo-seed.ts
   ```
2. Start the backend (`campaign-buddy-backend`, `npm run dev`, port 4000).
3. For portal shots: start the portal (`campaign-buddy-portal`, `npm run dev`, port 5173).
4. For mobile shots: start the app's Expo web build (`campaign-buddy-app`,
   `npm run start -- --web`, port 8081).

## Usage

```bash
node portal.js              # every portal shot in the SHOTS list
node portal.js sales-status # only shots whose outfile contains this substring
node mobile.js
node mobile.js performance
```

Each script logs in as the right persona (credentials from the demo seed,
same as `campaign-buddy-portal/e2e/support/auth.ts` and
`campaign-buddy-app/e2e/login.spec.ts`), navigates, and writes straight to
the matching `../assets/<role>/*.webp` — swap-in-place, same as a manual
re-shoot.

`mobile.js` deliberately only visits read-only tabs (Performance, Sales). It
does not drive check-in/check-out or edit stock, because those mutate the
demo data on every run.

## Adding a new shot

Add an entry to the `SHOTS` array in `portal.js` or `mobile.js`:
`{ persona, route, outfile }` for a plain navigate-and-screenshot, or write a
one-off async function in `RECIPES` (`portal.js`) when the screen needs a
filter set or a search-select driven before there's anything worth
screenshotting — see `salesUpdateAutofill` / `trackingAllPromoters` for the
pattern.

## After a UI change

Update the matching guide's `.html` text (`../MAINTENANCE.md` has the rule),
then re-run the specific shot(s) that changed and eyeball the result before
committing — this script does not know good composition from bad, it just
takes what's on screen.
