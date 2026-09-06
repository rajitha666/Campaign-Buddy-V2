# Campaign Buddy — Mobile App

React Native (Expo) implementation of the Campaign Buddy field-rep app, built
from the interactive HTML prototype and `CampaignBuddy_API_Spec.md`. This
README is the handoff doc — read it before touching code.

## ⚠️ Before you do anything else

This was scaffolded in an environment with **no network access**, so:

1. **`npm install` has never been run against this code.** Treat your first
   install as the real build-verification step — dependency versions in
   `package.json` are reasonable-as-of-writing pins, not verified-compatible
   pins. Run `npx expo install --fix` after the first install to let Expo
   align versions to your SDK.
2. **Poppins font files are missing.** See `assets/fonts/README.md` —
   download `Poppins-SemiBold.ttf` and `Poppins-Bold.ttf` from Google Fonts
   and drop them in that folder. The app will crash on startup until you do.
3. **Nothing has been run or tested.** Every file was hand-written against
   known Expo/React Navigation/React Query APIs, but treat this as a
   thorough first draft, not a verified build. Expect a handful of small
   fixes on first compile — likely candidates: exact Expo SDK version
   compatibility, and the axios/react-query major version pairing.

## Setup

```bash
npm install
npx expo install --fix   # aligns native package versions to your Expo SDK
```

Set your API base URL — create a `.env` file (or set it in `eas.json` per
build profile):

```
EXPO_PUBLIC_API_BASE_URL=https://your-backend.example.com/v1
```

Then:

```bash
npm run android   # or: npm run ios (once you have a Mac / EAS build)
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

## Known gaps to close with backend

1. **`otherInterestedCustomers` isn't in the products list endpoint.**
   `ProductUpdateScreen` currently defaults it to `0` on screen entry (see
   the TODO comment on `HomeStackParamList['ProductUpdate']` in
   `src/navigation/types.ts`). Either add it to
   `GET /campaigns/{id}/outlets/{id}/products`, or add a
   `GET /products/{cpaId}/stock` endpoint for this screen to call on mount.
2. **Date pickers are placeholders.** `TimeOffRequestSheet` shows fixed
   from/to dates rather than a real picker — wire up
   `@react-native-community/datetimepicker` (not included yet) when ready.
3. **Forgot-password has no screen.** `LoginScreen`'s "Forgot password?"
   text has a TODO but no navigation target — `authApi.forgotPassword()` is
   ready to call once that screen exists.
4. **Token refresh isn't wired into the axios interceptor.** `authApi.ts`
   has `refreshAccessToken()`, but nothing calls it yet on a 401. Add a
   response interceptor in `client.ts` before shipping — right now a
   401 just surfaces as a generic error.

## Design system discipline

Every color, font size, and spacing value should come from `src/theme/`.
If a screen needs a value that isn't there, add it to the theme file first
— don't hardcode a hex code or a magic number inline. This is what keeps
100+ screens/components looking like one coherent app instead of drifting
over time.
