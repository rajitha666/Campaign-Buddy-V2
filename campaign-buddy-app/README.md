# Campaign Buddy — Mobile App

React Native (Expo) implementation of the Campaign Buddy field-rep app, built
from the interactive HTML prototype and `docs/api-spec.md`. This
README is the handoff doc — read it before touching code.

## Status

Brought up and wired to the `campaign-buddy-backend` `/v1` API (2026-09-06):

- **Expo SDK 57** (upgraded from 51 on 2026-09-07 so the App Store Expo Go — latest SDK only — can open it): RN 0.86 / React 19.2 / React Navigation 7. `.npmrc` pins `legacy-peer-deps=true`; `npx expo-doctor` is clean.
- **npm install**: use `npm install --ignore-scripts` (npm 11 blocks lifecycle scripts); native builds aren't needed for the web preview or Expo Go.
- **Fonts**: loaded from `@expo-google-fonts/poppins` (JS-bundled TTFs) — no manual `assets/fonts/*.ttf` needed.
- **Auth**: `AuthContext` fetches `/me` after login because the v3 `/auth/login` returns tokens only. Access-token refresh is wired into the axios response interceptor (`src/api/client.ts` — `registerAuthFailureHandler`, single in-flight refresh, retry-once); a failed refresh clears the session.
- **Web**: `expo start --web` works. `expo-secure-store` has no web implementation, so token storage is split — `secureStore.ts` (native Keychain/Keystore) / `secureStore.web.ts` (localStorage). The `BottomSheetModal` (product details / time-off form / checkout confirm) renders but its layout on web is imperfect — it's fine on a device, or swap in `@gorhom/bottom-sheet` as noted below.
- **Scaffold complete**: date rendering pinned to UTC via `src/lib/date.ts`; `otherInterestedCustomers` threaded through the products list → `ProductUpdateScreen`; real date pickers (`@react-native-community/datetimepicker`) in the time-off sheet; `ForgotPasswordScreen` wired into the auth stack. No `TODO`/`FIXME` markers remain.
- **Custom sales fields** (issue #13): admins define extra fields per campaign in the portal; `GET /v1/sales-fields` returns them. Day-scope fields render on `SalesSummaryScreen` (locked once the day is confirmed; a required one blocks *Confirm & submit* with a `422`), product-scope fields on `ProductUpdateScreen` (passed through the nav params from the products list). One `CustomFieldInput` component renders all four types.
- Verified on web against the live backend: Login, Home, Sales, Attendance (incl. check-out), Performance, Time off, Profile, Update Stock.

## Field guide

The Profile screen and the `?` button on Home open the promoter training guide
(`marketing/training/promoter.html`) in the device browser — see
`src/lib/trainingGuide.ts`. Host it wherever the marketing site lives; override
per environment with `EXPO_PUBLIC_TRAINING_URL`. Content is maintained in
`marketing/training/` (`MAINTENANCE.md` there).

## Setup

```bash
npm install --ignore-scripts
cp .env.example .env         # EXPO_PUBLIC_API_BASE_URL — see the file's comments
npm run start -- --web       # browser preview  (EXPO_PUBLIC_API_BASE_URL = http://localhost:4000/v1)
```

### On a physical iPhone / Android via Expo Go

1. Install **Expo Go** from the App Store / Play Store (it tracks the latest SDK — this app is on 57).
2. Phone and dev machine on the **same Wi-Fi**.
3. `.env` → `EXPO_PUBLIC_API_BASE_URL=http://<dev-machine-LAN-IP>:4000/v1` (not `localhost`; find it with `ipconfig`).
4. Allow inbound TCP **4000** (backend) and **8081** (Metro) through the dev machine's firewall. One-time, admin PowerShell:
   ```powershell
   New-NetFirewallRule -DisplayName "CampaignBuddy dev (Expo+API)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081,4000 -Profile Private,Public -RemoteAddress LocalSubnet
   ```
5. Start the backend (`cd ../campaign-buddy-backend && npm run dev`), then `npx expo start` here and scan the QR with the iPhone Camera.
   - Different networks / firewall you can't touch: `npx expo start --tunnel` (Metro only — the backend URL in `.env` must still be reachable from the phone).

## Tests

```bash
npm test           # vitest run --config vitest.config.mts
npm run test:watch
```

Pure-logic only — no RN/Expo runtime. `src/lib/date.test.ts` covers the
`@db.Date` UTC pinning (`formatDay`, `dayOfMonth`, `ymd`);
`src/api/adapters.test.ts` mocks `./client` and asserts each `/v1` adapter
hits the right path/verb and unwraps `{ data }`.

### e2e (Playwright, Expo web)

```bash
npx playwright install chromium     # once
cd campaign-buddy-backend && npm run prisma:seed && npm run prisma:seed:demo
cd campaign-buddy-app && EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/v1 npm run start -- --web   # separate terminal
npm run test:e2e
```

`e2e/login.spec.ts` is a single smoke test: sign in as the demo promoter and
confirm Home renders. There's no simulator/emulator toolchain set up in this
repo's dev environment (see "Known gaps" below), so this runs against the
**Expo web** build — it covers the JS/React logic, not native-only behavior
(GPS, push). Everything else — check-in, stock updates, sales, attendance —
is still manual verification for now; expanding this suite is follow-up work,
not a one-time deliverable. See `.github/workflows/ci.yml` (job `app-e2e`).

## Release flow (publishing the APK)

CB Mobile is distributed as a release APK served from the public downloads
page (`marketing/downloads/`, live at `/downloads/`). To ship an update:

1. Bump **`expo.version`** in `app.json` (single source of truth), then
   `npx expo prebuild` so `android/app/build.gradle` picks it up.
2. Build the APK:
   ```bash
   cd android && ./gradlew assembleRelease
   ```
3. Publish it — this copies the APK to
   `marketing/downloads/apk/campaignbuddy-<versionCode>.apk` and adds a row
   (version, code, date) above the `<!-- VERSIONS -->` marker in
   `marketing/downloads/index.html`:
   ```bash
   node scripts/publish-apk.mjs
   ```
4. `git add marketing/downloads && git commit && git push` — the server's
   nginx container serves the updated page + APK.

The version code is computed as `major*100000 + minor*100 + patch`
(`1.0.0 → 100000`, `2.8.7 → 208070`). The script refuses to run when
`build.gradle` and `app.json` disagree, the APK hasn't been built, or the
version is already listed — always bump `expo.version` for each release.

## Architecture

```
App.tsx                     — entry point: fonts, QueryClientProvider, AuthProvider
src/
  theme/                     — colors, typography, spacing tokens (design system, do not bypass)
  api/                       — one file per backend resource, matches docs/api-spec.md 1:1
    types.ts                 — TypeScript models mirroring the spec's data models exactly
    client.ts                — shared axios instance + auth token attachment
  context/
    AuthContext.tsx           — session state, login/logout, token persistence (SecureStore)
    AttendanceContext.tsx     — checked-in state; single source of truth app-wide
  hooks/
    useLocationTracking.ts    — foreground-only location ping, see below
  components/                — shared UI: Button, Chip, Stepper, Card, BottomSheetModal, etc.
  navigation/
    RootNavigator             — Auth vs authenticated app switch
    AuthenticatedApp          — mounts AttendanceProvider + location tracking (post-login only)
    MainTabs                  — bottom tabs: Home / Sales / Attendance / Performance
    HomeStack, AttendanceStack — nested stacks for screens reached by pushing, not tabbing
  screens/                    — one file per screen
```

### Why only 4 bottom tabs?

Home, Sales, Attendance, Performance. Campaign products, Time off, and
Profile are **not** tabs — they're reached by pushing from within a tab:

- Campaign products: Home → "Campaign products" row
- Time off: Attendance → "Request time off" row
- Profile: Home → tap the avatar

This matches the final nav decision from the design phase — don't add them
back as tabs without checking with product first.

### Location tracking — read this before touching `useLocationTracking.ts`

Per API spec §5, location pings must fire **only** between check-in and
check-out, and **only** while the app is foregrounded. `useLocationTracking`
implements this exactly:

- Starts a 60s timer the instant `AttendanceContext.checkedIn` becomes true
  AND the app is in the foreground.
- Sends one ping immediately whenever the app returns to foreground while
  still checked in.
- Stops the timer completely (not just pauses) the moment the app
  backgrounds OR the user checks out.
- Skips a ping if the device hasn't moved >10m since the last one, except
  the interval still fires as a heartbeat regardless.

It's mounted once, in `AuthenticatedApp.tsx`, not per-screen. Don't call
`sendLocationPing` from anywhere else.

### Bottom sheets

`BottomSheetModal` is a zero-dependency wrapper around RN's core `Modal` —
tap the dimmed backdrop to close, tap inside the sheet to not. Used for
product details, the time-off request form, and the checkout confirmation.
If you want drag-to-dismiss/snap points later, swap this one file for
`@gorhom/bottom-sheet` — every call site uses the same
`<BottomSheetModal visible={...} onClose={...}>` API, so it's a contained
change.

### Data fetching

TanStack Query (`@tanstack/react-query`) for all reads; each screen's
`useQuery` calls the matching function in `src/api/`. Mutations
(check-in/out, stock updates, stats updates, time-off requests, sales
confirm) use `useMutation` and invalidate the relevant query keys on
success — check each screen for which keys it invalidates before changing
an endpoint's response shape.

## Known gaps

1. **`BottomSheetModal` on web** — layout is imperfect; native is fine, or swap
   in `@gorhom/bottom-sheet` (contained change, same call signature).
2. **No offline write queue.** Check-in, stock saves and sales-summary confirm
   need a live connection — there's no local queue / replay. Reads are cached
   (TanStack Query) and refetch on reconnect.
3. **Native run** — post-SDK-57, the app has been exercised on Expo web against the
   live backend (login, all tabs, native-stack push, bottom sheet). Running in
   Expo Go on a physical device follows the steps above; an iOS **Simulator** /
   Android emulator still needs the usual native toolchain (Xcode / Android
   Studio) which isn't set up on the current Windows dev machine.
4. **Forgot-password delivery is a backend stub.** The screen and
   `authApi.forgotPassword()` work, but the backend sends no email/SMS
   (`docs/backend-spec.md` §8).

## Design system discipline

Every color, font size, and spacing value should come from `src/theme/`.
If a screen needs a value that isn't there, add it to the theme file first
— don't hardcode a hex code or a magic number inline. This is what keeps
100+ screens/components looking like one coherent app instead of drifting
over time.
