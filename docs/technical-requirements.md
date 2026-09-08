# Campaign Buddy — Technical Requirements

What each part of the system needs to build and run. Versions are drawn from the
committed `package.json` / lockfiles / `.env.example` / `app.json`
(backend/portal 2026-09-06; mobile app on **Expo SDK 57** as of 2026-09-07).

- [Backend](#backend--campaign-buddy-backend) — the API, required by everything else
- [Mobile app](#mobile-app--campaign-buddy-app) — CB Mobile
- [Web portal](#web-portal--campaign-buddy-portal) — CB Office

---

## Backend — `campaign-buddy-backend`

### Runtime environment

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **18 LTS minimum**, 20+ recommended | Built & tested on **24.19.0**. Prisma 5.22 and the RN toolchain both need ≥ 18. |
| **npm** | 9+ | Developed on 11. npm 11 blocks package lifecycle scripts — the `allowScripts` block in `package.json` covers prisma/bcrypt; otherwise `npm install --ignore-scripts && npm rebuild bcrypt`. |
| **PostgreSQL** | **14+** | Built on **16**. Uses native `enum` types, native array columns (`text[]`), `DATE` / `TIMESTAMP`. **No extensions required** (no PostGIS / citext / uuid-ossp). |
| **OS** | any | Developed on Windows 10; Linux/macOS fine. Docker optional. |
| **Build toolchain** | only if `bcrypt` has no prebuilt binary for the platform | Python 3 + a C++ compiler (node-gyp): "Desktop development with C++" (VS Build Tools) on Windows, Xcode Command Line Tools on macOS, `build-essential` on Linux. Normally a prebuilt binary is fetched and this is not needed. |

### Dependencies (installed versions)

- **prisma / @prisma/client 5.22.0**, express 4.22, typescript 5.9
- bcrypt 5.1 (native addon), jsonwebtoken 9, zod 4.5, cors, dotenv
- dev / test only: ts-node, ts-node-dev, vitest 5 + vite 8, supertest 7

### Environment variables (`.env`)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `PORT` | no | `4000` | HTTP listen port |
| `STAFF_JWT_SECRET` | yes | — | mobile access-token signing key |
| `STAFF_JWT_EXPIRES_IN` | no | `86400` | seconds |
| `STAFF_REFRESH_TOKEN_TTL_DAYS` | no | `30` | mobile refresh-token lifetime |
| `USER_JWT_SECRET` | yes | — | portal access-token signing key |
| `USER_JWT_EXPIRES_IN` | no | `"8h"` | duration string |
| `BCRYPT_SALT_ROUNDS` | no | `10` | |

The two JWT secrets **must be different** and set to strong random values.

### Setup & run

```bash
npm install
cp .env.example .env           # set DATABASE_URL + both JWT secrets
npx prisma migrate deploy      # applies the 2 migrations (~25 tables)
npm run prisma:seed            # optional demo data
npm run dev                    # :4000, hot reload

# production:
npm run build && npm start     # compiles to dist/, runs node dist/src/server.js
```

`GET /health` is a liveness check.

### Network / infrastructure

- **Inbound:** TCP `4000` (HTTP). Terminate TLS at a reverse proxy for production.
- **Outbound:** PostgreSQL (`5432` default). **Nothing else** — no email / SMS /
  object storage / message queue.
- CORS is currently wide open (`cors()` defaults) — restrict for production.
- The process is **stateless** — all state is in Postgres, so it scales
  horizontally behind a load balancer.
- A separate `*_test` database is needed only to run `npm test`
  (`test/setup.ts` refuses any `DATABASE_URL` that does not end in `_test`).

---

## Mobile app — `campaign-buddy-app`

### Build / development environment

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **20+** | Built on 24. React Native 0.86 requires ≥ 20. |
| **npm** | — | Use `npm install --ignore-scripts` (npm 11 blocks lifecycle scripts). `.npmrc` pins `legacy-peer-deps=true`. |
| **Expo SDK** | **57** | Upgraded from 51 on 2026-09-07 so the App Store Expo Go (latest SDK only) can open it. Via `npx expo` — no global CLI install needed. `npx expo-doctor` is clean. |
| **React Native** | **0.86.3** | React 19.2.3 / React Navigation 7 |
| **TypeScript** | ~6.0 | extends `expo/tsconfig.base` |
| Watchman | recommended on macOS | |

### Environment (`.env`)

- `EXPO_PUBLIC_API_BASE_URL` — the backend's **`/v1`** base URL. Baked into the
  JS bundle at build time.
  - Expo web / iOS Simulator / Android emulator on the same machine:
    `http://localhost:4000/v1`
  - **Physical device via Expo Go (same Wi-Fi): the dev machine's LAN IP**, e.g.
    `http://192.168.1.20:4000/v1` (not `localhost`; find it with `ipconfig` /
    `ifconfig`)
  - `npx expo start --tunnel` (any network): the backend URL must be publicly
    reachable — localhost / LAN IPs will not work through the tunnel.

### Run in a browser (the path exercised in this build)

```bash
npm install --ignore-scripts
cp .env.example .env
npm run start -- --web        # Metro on :8081, opens the browser
```

Needs a modern evergreen browser; grant **geolocation** permission for check-in.
`react-native-web` / `react-dom` / `@expo/metro-runtime` are already included.

### Run on a device / emulator

| Target | Needs |
|---|---|
| **Expo Go (fastest)** | The **Expo Go** app from the App Store / Play Store (tracks the latest SDK — this app is on 57), device on the **same Wi‑Fi** as the dev machine, then `npx expo start` and scan the QR. Open inbound TCP **4000** (backend) + **8081** (Metro) on the dev machine's firewall. Exercised on Expo web against the live backend post-SDK-57. |
| **iOS Simulator** | macOS + **Xcode 15+**, CocoaPods — not set up on the current Windows dev machine |
| **Android emulator** | **Android Studio** + SDK, **JDK 17**, Android **7.0 / API 24+** target — not set up on the current Windows dev machine |
| **iOS / Android native build** | as above; `npx expo prebuild` then the platform toolchain |
| **Standalone binaries** (`.ipa` / `.aab`) | **EAS Build** + a free Expo account — not configured in this repo yet |

Bundle identifiers are set: iOS & Android `com.dyuro.campaignbuddy`.

### Device runtime requirements

- **Location services** (foreground only) — `ACCESS_FINE_LOCATION` /
  `ACCESS_COARSE_LOCATION` (Android), `NSLocationWhenInUseUsageDescription` (iOS);
  both declared in `app.json`.
- **A network connection to the backend at all times** — there is no offline
  mode; check-in, stock saves and summary-confirm need connectivity.
- Secure token storage: Keychain / Keystore on native (`expo-secure-store`),
  `localStorage` on web.
- `expo-battery` (optional — reports battery % with location pings).

### Key libraries

@react-navigation v7 (native-stack + bottom-tabs) · @tanstack/react-query v5 ·
axios 1.6 · react-native-svg 15.15 · react-native-safe-area-context 5.7 ·
react-native-screens 4.26 · @react-native-community/datetimepicker 9.1.0 ·
@expo-google-fonts/poppins

---

## Web portal — `campaign-buddy-portal`

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18+ | |
| **npm** | — | `npm install` — esbuild needs its postinstall; `allowScripts` covers it |
| **Vite** | 5 | React 18, react-router-dom 6 |

### Run

```bash
npm install
cp .env.example .env      # VITE_API_BASE_URL — blank = use the dev proxy
npm run dev               # :5173, proxies /admin/v1/* -> :4000

# production:
npm run build             # -> static dist/
```

- `dist/` is **fully static** — serve it from any static host / CDN / nginx, no
  server runtime.
- `VITE_API_BASE_URL` blank uses the Vite dev proxy (local dev only); set it to
  the API origin for a production build.
- Client: modern evergreen browser.

---

## At a glance

| | Backend | Mobile | Portal |
|---|---|---|---|
| Node | 18+ (built on 24) | 20+ (built on 24) | 18+ |
| Extra runtime | PostgreSQL 14+ | device location services | — (static after build) |
| Listens on | `:4000` | Metro `:8081` (dev) | `:5173` (dev) |
| Production artifact | `dist/` + `node` process | `.ipa` / `.aab` via EAS | static `dist/` |
| External services | none | none | none |
