# Campaign Buddy — Mobile App

React Native (Expo) implementation of the Campaign Buddy field-rep app, built
from the interactive HTML prototype and `docs/api-spec.md`. This
README is the handoff doc — read it before touching code.

## Status

Brought up and wired to the `campaign-buddy-backend` `/v1` API (2026-09-06):

- **npm install**: use `npm install --ignore-scripts` (npm 11 + `react-native-screens@3.31.0`'s `prepare` script don't get along); native builds aren't needed for the web preview.
- **Fonts**: now loaded from `@expo-google-fonts/poppins` (JS-bundled TTFs) — no manual `assets/fonts/*.ttf` needed. `assets/fonts/README.md` is stale.
- **Auth**: `AuthContext` fetches `/me` after login because the v3 `/auth/login` returns tokens only. Access-token refresh is wired into the axios response interceptor (`src/api/client.ts` — `registerAuthFailureHandler`, single in-flight refresh, retry-once); a failed refresh clears the session.
- **Web**: `expo start --web` works. `expo-secure-store` has no web implementation, so token storage is split — `secureStore.ts` (native Keychain/Keystore) / `secureStore.web.ts` (localStorage). The `BottomSheetModal` (product details / time-off form / checkout confirm) renders but its layout on web is imperfect — it's fine on a device, or swap in `@gorhom/bottom-sheet` as noted below.
- **Scaffold complete**: date rendering pinned to UTC via `src/lib/date.ts`; `otherInterestedCustomers` threaded through the products list → `ProductUpdateScreen`; real date pickers (`@react-native-community/datetimepicker`) in the time-off sheet; `ForgotPasswordScreen` wired into the auth stack. No `TODO`/`FIXME` markers remain.
- Verified on web against the live backend: Login, Home, Sales, Attendance (incl. check-out), Performance, Time off, Profile, Update Stock.

## Setup

```bash
npm install --ignore-scripts
cp .env.example .env         # EXPO_PUBLIC_API_BASE_URL, default http://localhost:4000/v1
npm run start -- --web       # browser preview
# or:  npm run android / npm run ios   (device / emulator, once native builds are set up)
```

## Tests

```bash
npm test           # vitest run --config vitest.config.mts
npm run test:watch
```

Pure-logic only — no RN/Expo runtime. `src/lib/date.test.ts` covers the
`@db.Date` UTC pinning (`formatDay`, `dayOfMonth`, `ymd`);
`src/api/adapters.test.ts` mocks `./client` and asserts each `/v1` adapter
hits the right path/verb and unwraps `{ data }`. Screen and navigation
coverage is manual.

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
3. **Native device / emulator run is untried on the current dev machine** — only
   the Expo web preview has been exercised end to end. The native check-in path
   (real GPS) is covered by the backend's integration tests.
4. **Forgot-password delivery is a backend stub.** The screen and
   `authApi.forgotPassword()` work, but the backend sends no email/SMS
   (`docs/backend-spec.md` §8).
5. `assets/fonts/README.md` is stale — fonts now come from
   `@expo-google-fonts/poppins`, no manual TTF files needed.

## Design system discipline

Every color, font size, and spacing value should come from `src/theme/`.
If a screen needs a value that isn't there, add it to the theme file first
— don't hardcode a hex code or a magic number inline. This is what keeps
100+ screens/components looking like one coherent app instead of drifting
over time.
