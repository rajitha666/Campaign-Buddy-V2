# Keeping the training guides current

The guides in this folder are shipped to users **inside the product**:

- **CB Office** serves them at `/training/<role>.html` from the account menu.
  Each persona sees its own guide; `admin` and `supervisor` also get the
  **promoter** guide (they support promoters in the field).
- **CB Mobile** links to `promoter.html` from the Profile screen and the `?`
  button on Home (`campaign-buddy-app/src/lib/trainingGuide.ts`) — opened in the
  device browser, so the hosted copy must be reachable
  (`EXPO_PUBLIC_TRAINING_URL`, default `https://campaignbuddy.lk/training/`).
- The **marketing site** serves the same files publicly.

A stale screenshot or a step that no longer matches the UI is a user-facing bug.

## The rule

**Any change that alters what a user sees or does on a screen must update the
matching guide in the same PR.** That includes:

- a renamed / moved / added / removed nav item, button, tab, column or field
- a changed flow (extra step, reordered steps, a new confirmation)
- a new feature that a role can use from the portal or the app
- a screen that was redesigned enough that the screenshot looks wrong

Cosmetic-only changes (spacing, colour, copy tweaks that don't change meaning)
don't need a re-shoot, but do fix step text if it now reads wrong.

If you can't do the re-shoot in the same PR, open a follow-up issue titled
`[docs] Re-shoot <screen> in <role> guide` and link it from the PR.

A CI job (`training-docs-reminder` in `.github/workflows/ci.yml`) comments on
a PR that touches portal/app UI source without a matching change under
`marketing/training/`, as a non-blocking nudge — it doesn't know "cosmetic
only" from "needs a re-shoot," so use judgment same as always.

## Which guide covers what

| Guide | Role(s) | Shown in | Screens covered |
|---|---|---|---|
| `admin.html` | `adm`, `usr`, `super` (persona `admin`) | CB Office | catalog, outlets, campaigns, activations, staff, attendance, leave, sales + corrections, custom fields, tracking, reports, users, roles, licence usage |
| `supervisor.html` | `supervisor` | CB Office **and** CB Mobile | supervisor dashboard, my campaigns, staff attendance/absence, my outlet attendance, my leave requests, promoter list, SKU-wise sales, reports — **plus** the app's My Route (today's visits + planned route) and Profile tabs |
| `sponsor.html` | `sponsor`, `client` | CB Office | sponsor dashboard, activation list, sales & footfall, live locations, client reports (SKU / brand) |
| `promoter.html` | Staff logins | CB Mobile, **and** the `admin` + `supervisor` menus in CB Office | login, shift check-in/out, products, sales & stats entry, performance, time-off, profile |

Persona mapping lives in `campaign-buddy-portal/src/context/AuthContext.jsx`
(`roleToPersona`). Portal nav lives in `campaign-buddy-portal/src/config/nav.js`
— if you touch that file, check the admin/supervisor/sponsor guides.

## Screenshot ↔ screen map

Screenshots live in `assets/<role>/` as `NN-<slug>.webp`. The slug matches the
screen; swap a file in place (same name) and the guide picks it up — no HTML edit
needed unless the step text changed.

- `assets/portal-admin/` → the `admin` persona's routes (`/dashboard`, `/clients`,
  `/items`, `/brands`, `/reorder`, `/campaigns`, `/activations`, `/outlets`,
  `/cities`, `/staff*`, `/leave-requests`, `/supervisor-tasks`, `/assign-routes`,
  `/outlet-attendance`, `/sales*`, `/tracking/*`, `/reports/*`, `/users`,
  `/roles`, `/license`)
- `assets/portal-supervisor/` → the `supervisor` persona's routes
  (`/dashboard`, `/my-campaigns`, `/staff/attendance`, `/staff/absence`,
  `/my-outlet-attendance`, `/my-leave-requests`, `/promoter-list`,
  `/sales/sku-wise`, `/reports/sku-wise`)
- `assets/portal-sponsor/` → the `sponsor` persona's routes (`/dashboard`,
  `/activations/client`, `/sponsor/sales`, `/tracking/live`,
  `/reports/client-sku-wise`, `/reports/client-brand-wise`)
- `assets/mobile-promoter/` → CB Mobile screens for a promoter (`role: field_rep`) login
- `assets/mobile-supervisor/` → CB Mobile screens for a supervisor (`role: campaign_owner`)
  login — My Route, Profile. Log in as `dinesh` / `Field123!` after the demo seed
  (Staff `userType: "supervisor"` — see `prisma/demo-seed.ts`), not a promoter login;
  the app renders a completely different 2-tab layout for this role
  (`campaign-buddy-app/src/navigation/SupervisorTabs.tsx`).

## Re-shooting a screen

1. Seed the demo dataset the shots were taken against:
   ```bash
   cd campaign-buddy-backend && npm run prisma:seed && npx ts-node prisma/demo-seed.ts
   ```
   (builds the "Radiance Q3 Push" sample campaign — a week of activity)
2. Run the portal (`campaign-buddy-portal`, `npm run dev`) or the app
   (`campaign-buddy-app`, `npm run start -- --web`) and sign in as the role.
   Portal logins: `admin` / `ChangeMe123!`. Mobile: `sktest` / `Field123!`.
3. Capture the screen at the **same viewport width** as the existing shots
   (portal shots are desktop width; promoter shots are phone width).
4. Export to WebP, keep the filename identical, drop it in `assets/<role>/`.
5. Update the step's `<p>` text in `<role>.html` if the wording is now wrong.
6. `cd marketing && npx serve . -l 8080` (or `python -m http.server 8080`),
   open `http://localhost:8080/training/`, and eyeball the guide.

> The Puppeteer capture harness that produced the original batch is **not in the
> repo**. Re-shoots are manual for now. If re-shooting becomes frequent, that
> harness is worth committing.

## How the portal ships these files

- **Local dev / local build:** `campaign-buddy-portal` copies this folder to
  `campaign-buddy-portal/public/training/` via `scripts/sync-training.mjs`, run
  automatically by the `predev` / `prebuild` npm hooks (and `npm run
  sync:training`). That copy is gitignored — this folder is the single source.
- **Docker / production:** the portal's nginx proxies `/training/` to the
  `marketing` container, which serves this folder directly
  (`docker-compose.yml` + `campaign-buddy-portal/nginx.conf`).

So there is only ever **one copy to edit: this one.**
