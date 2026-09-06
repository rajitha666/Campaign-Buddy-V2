# Campaign Buddy — Mobile App

React Native (Expo) implementation of the Campaign Buddy field-rep app, built
from the interactive HTML prototype and `CampaignBuddy_API_Spec.md`. This
README is the handoff doc — read it before touching code.

## Status

Brought up and wired to the `campaign-buddy-backend` `/v1` API (2026-09-06):

- **npm install**: use `npm install --ignore-scripts` (npm 11 + `react-native-screens@3.31.0`'s `prepare` script don't get along); native builds aren't needed for the web preview.
- **Fonts**: now loaded from `@expo-google-fonts/poppins` (JS-bundled TTFs) — no manual `assets/fonts/*.ttf` needed. `assets/fonts/README.md` is stale.
- **Auth**: `AuthContext` fetches `/me` after login because the v3 `/auth/login` returns tokens only.
- **Web**: `expo start --web` works. `expo-secure-store` has no web implementation, so token storage is split — `secureStore.ts` (native Keychain/Keystore) / `secureStore.web.ts` (localStorage). The `BottomSheetModal` (product details / time-off form / checkout confirm) renders but its layout on web is imperfect — it's fine on a device, or swap in `@gorhom/bottom-sheet` as noted below.
- Verified on web against the live backend: Login, Home, Sales, Attendance (incl. check-out), Performance, Time off, Profile, Update Stock.

## Setup

```bash
npm install --ignore-scripts
cp .env.example .env         # EXPO_PUBLIC_API_BASE_URL, default http://localhost:4000/v1
npm run start -- --web       # browser preview
# or:  npm run android / npm run ios   (device / emulator, once native builds are set up)
```

## Architecture

```
App.tsx                     — entry point: fonts, QueryClientProvider, AuthProvider
src/
  theme/                     — colors, typography, spacing tokens (design system, do not bypass)
  api/                       — one file per backend resource, matches CampaignBuddy_API_Spec.md 1:1
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

1. **Date display.** Several screens render `@db.Date` values (leave-request
   dates, attendance-history rows) with a raw/short format — the backend sends
   `…T00:00:00.000Z` and the RN formatters treat it as local, so a negative-UTC
   device shows the previous day / a day-only string. Format these in UTC.
2. **`otherInterestedCustomers` isn't in the products list endpoint** —
   `ProductUpdateScreen` defaults it to `0` on entry. Add it to the list
   response or a `GET /products/{cpaId}/stock` if the mount value matters.
3. **Date pickers are placeholders.** `TimeOffRequestSheet` shows fixed
   from/to dates — wire up `@react-native-community/datetimepicker`.
4. **Forgot-password has no screen.** `authApi.forgotPassword()` is ready.
5. **Token refresh isn't wired into the axios interceptor.** `authApi.ts` has
   `refreshAccessToken()`; add a 401 response interceptor in `client.ts`. (The
   backend's `/v1/auth/refresh` returns `{ accessToken }` only.)
6. **`BottomSheetModal` on web** — layout is imperfect; native is fine, or swap
   in `@gorhom/bottom-sheet` (contained change, same call signature).

## Design system discipline

Every color, font size, and spacing value should come from `src/theme/`.
If a screen needs a value that isn't there, add it to the theme file first
— don't hardcode a hex code or a magic number inline. This is what keeps
100+ screens/components looking like one coherent app instead of drifting
over time.
