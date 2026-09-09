# Campaign Buddy — Installation Guide

The single, current guide for installing, running and deploying Campaign Buddy —
local development and production — including the **License Usage Tracking**
feature added 2026-09-08.

> Supersedes `DEPLOYMENT.md` and `DOCKER_DEPLOYMENT.md` (kept for history). Where
> they disagree with this document, this one wins.

---

## 1. What you are deploying

| Component | Folder | Stack | Port (container) |
|---|---|---|---|
| **API** — serves both front ends | `campaign-buddy-backend/` | Node 20 · TypeScript · Express · Prisma | `4000` |
| **CB Office** — web portal (admin / supervisor / sponsor) | `campaign-buddy-portal/` | React 18 · Vite · nginx | `80` |
| **CB Mobile** — field-rep app | `campaign-buddy-app/` | Expo SDK 57 · React Native | Expo (not containerised) |
| **Database** | — | PostgreSQL 16 | `5432` |
| **Tunnel** (prod only) | — | `cloudflare/cloudflared` | — |

Production runtime topology:

```
            Cloudflare Tunnel  (HTTPS, public hostname)
                     │
          ┌──────────▼───────────┐
          │ portal  (nginx :80)  │  serves the SPA, proxies:
          │  /admin/v1/* ─┐      │    /admin/v1/*  → backend  (portal API)
          │  /v1/*        ├──────┼──▶ /v1/*         → backend  (mobile API)
          │  /health      ┘      │    /health       → backend
          └──────────┬───────────┘
          ┌──────────▼───────────┐
          │ backend (node :4000) │  Express + Prisma; runs `prisma migrate
          │                      │  deploy` + idempotent seed on start;
          │                      │  hosts the daily license-usage cron
          └──────────┬───────────┘
          ┌──────────▼───────────┐
          │ postgres  (:5432)    │  named volume `postgres_data`
          └──────────────────────┘
```

---

## 2. Local development

### 2.1 Prerequisites

- **Node 20+** (built on Node 24 LTS)
- **PostgreSQL 14+** (built on PG 16). Local dev in this repo uses port **5433**.
- Git

### 2.2 Backend (`:4000`)

```bash
cd campaign-buddy-backend
npm install                       # installs node-cron + everything else
cp .env.example .env              # set DATABASE_URL + JWT secrets
npx prisma migrate dev            # applies all migrations incl. license usage
npm run prisma:seed               # demo client, campaign, outlet, promoter
npm run dev                       # ts-node-dev, http://localhost:4000/health
```

`.env` for local dev (matches this repo's setup):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/campaign_buddy?schema=public"
PORT=4000
STAFF_JWT_SECRET="dev-staff-secret"
USER_JWT_SECRET="dev-user-secret"
STAFF_JWT_EXPIRES_IN=86400
STAFF_REFRESH_TOKEN_TTL_DAYS=30
USER_JWT_EXPIRES_IN="8h"
BCRYPT_SALT_ROUNDS=10
# License usage tracking — optional; shown with their defaults
LICENSE_WARN_THRESHOLD_PCT=80
LICENSE_SNAPSHOT_DISABLED=0
# Portal issue reporting → GitHub Issues — optional; off by default
GITHUB_ISSUES_ENABLED=0
GITHUB_ISSUES_REPO="rajitha666/Campaign-Buddy-V2"
GITHUB_TOKEN=""
ISSUE_SYNC_DISABLED=0
```

> The license-usage snapshot job also runs in local dev. To silence it, set
> `LICENSE_SNAPSHOT_DISABLED=1`. It never runs under the test suite (tests import
> the Express app, not `server.ts`).

### 2.3 CB Office portal (`:5173`)

```bash
cd campaign-buddy-portal
npm install
npm run dev                       # Vite dev proxy forwards /admin/v1/* → :4000
```

Open http://localhost:5173, sign in as `admin` / `ChangeMe123!`.
The **License Usage** page is under **Admin → License Usage** (`/license`).

### 2.4 CB Mobile app

```bash
cd campaign-buddy-app
npm install --ignore-scripts
cp .env.example .env              # EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/v1
npm run start -- --web           # browser preview; or npm run android / npm run ios
```

Sign in as `sktest` / `Field123!`. For a physical device over Expo Go, set
`EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP (not `localhost`) and open
inbound TCP 4000 + 8081.

### 2.5 Tests

```bash
cd campaign-buddy-backend && npm test   # vitest + supertest — needs a *_test DB
cd campaign-buddy-portal  && npm test   # vitest unit
cd campaign-buddy-app     && npm test   # vitest unit
```

Backend tests need a disposable database whose name ends in `_test`:

```bash
psql -h localhost -p 5433 -U postgres -c "CREATE DATABASE campaign_buddy_test"
cp .env.test.example .env.test   # or create it; DATABASE_URL must end in _test
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/campaign_buddy_test?schema=public" \
  npx prisma migrate deploy
npm test
```

---

## 3. Production deployment (Docker Compose)

### 3.1 Prerequisites

- A VPS with **Docker Engine + Docker Compose v2**
- SSH access
- (Recommended) a Cloudflare account for the tunnel, or a reverse proxy / TLS of
  your own

### 3.2 First install

```bash
# 1. Clone
git clone https://github.com/rajitha666/Campaign-Buddy-V2.git /opt/campaign-buddy
cd /opt/campaign-buddy

# 2. Environment
cp .env.example .env

# 3. Generate secrets
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
echo "STAFF_JWT_SECRET=$(openssl rand -hex 32)"
echo "USER_JWT_SECRET=$(openssl rand -hex 32)"
#   → paste these into .env

# 4. Edit .env (see the reference in §5). At minimum set:
#      POSTGRES_PASSWORD, STAFF_JWT_SECRET, USER_JWT_SECRET,
#      CLOUDFLARED_TUNNEL_TOKEN (if using the tunnel)
nano .env

# 5. Build + start
#    production (tunnel, no public ports):
docker compose -f docker-compose.yml --profile production up -d --build
#    OR local/no-tunnel (exposes :4000 / :5173 / :5432 via the override file):
docker compose up -d --build
```

On start the backend container automatically:

1. runs `prisma migrate deploy` — applies **every** migration, including
   `20260908171132_add_license_usage_tracking`;
2. runs the seed **idempotently** (safe on an existing database);
3. starts the API and the license-usage snapshot cron.

### 3.3 Verify

```bash
docker compose ps                        # all services Up; postgres healthy
docker compose logs -f backend           # look for "listening on port 4000"
curl http://localhost:4000/health        # {"status":"ok",...}   (override/local)
curl https://<your-hostname>/health      # via the tunnel
docker compose logs backend | grep license-snapshot   # boot snapshot ran
```

Then open the portal, sign in, and check **Admin → License Usage** loads.

### 3.4 Cloudflare Tunnel

1. Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
2. Copy the tunnel token into `.env` as `CLOUDFLARED_TUNNEL_TOKEN`.
3. Add one public hostname routing **all** traffic through the portal's nginx
   (it proxies the API paths):

   | Public hostname | Service |
   |---|---|
   | `cb.yourdomain.com` | `http://portal:80` |

4. Start with the `production` profile (as in §3.2 step 5). `cloudflared` only
   runs under that profile; `docker-compose.override.yml` (public ports) is
   skipped when you pass `-f docker-compose.yml`.

### 3.5 Firewall (if not using the tunnel)

```bash
ufw allow 22
ufw allow 5173      # portal, only if public
ufw allow 4000      # API, only if public
ufw enable
```

---

## 4. Upgrading an existing production deployment

This is the path for shipping the License Usage Tracking change (and any future
change) to a VPS that is already running.

```bash
cd /opt/campaign-buddy

# 1. Back up the database first (see §7)
docker exec campaign-buddy-v2-postgres-1 \
  pg_dump -U postgres campaign_buddy > ~/backup_$(date +%Y%m%d_%H%M).sql

# 2. Pull the release (merge the PR to main first, then:)
git pull origin main

# 3. Rebuild the images that changed and restart.
#    The backend package-lock changed (adds node-cron) so its image must rebuild.
docker compose -f docker-compose.yml --profile production build backend portal
docker compose -f docker-compose.yml --profile production up -d

# 4. The backend entrypoint runs `prisma migrate deploy` on boot — the new
#    migration applies automatically. Confirm:
docker compose logs backend | grep -E "migrat|listening|license-snapshot"
docker compose exec backend ./node_modules/.bin/prisma migrate status
```

### 4.1 What the License Usage change touches at deploy time

| Concern | Detail |
|---|---|
| **Migration** | `20260908171132_add_license_usage_tracking` — adds 5 columns to `campaigns` (all with defaults, so existing rows are fine) and the `campaign_license_usage_snapshots` table. Applied automatically by the entrypoint. Reversible only by restoring a backup. |
| **New dependency** | `node-cron@4` (regular dependency). Picked up by the backend image rebuild (`npm ci --legacy-peer-deps`). No action beyond rebuilding `backend`. |
| **New env vars** | `LICENSE_WARN_THRESHOLD_PCT` (default `80`), `LICENSE_SNAPSHOT_DISABLED` (default `0`). Both optional — wired into `docker-compose.yml` with defaults. |
| **Timezone** | The snapshot job buckets weeks/months in `TZ` (default `Asia/Colombo`, set in compose). |
| **Background job** | A daily cron at 00:15 `TZ` plus a catch-up run on every backend start. Runs inside the single backend container — do not scale the backend to multiple replicas without disabling the job on all but one (`LICENSE_SNAPSHOT_DISABLED=1`). |
| **Existing data** | Every existing campaign gets caps **20 / 5 / 2 / 2** (promoter / supervisor / admin / sponsor) by column default. Adjust per campaign in **Admin → License Usage → Edit caps** (Super Admin only). |
| **Downtime** | ~10–30 s while the backend container restarts. The migration is additive and fast. |

### 4.2 Rollback

```bash
git checkout <previous-commit>
docker compose -f docker-compose.yml --profile production build backend portal
docker compose -f docker-compose.yml --profile production up -d
# The added columns/table are harmless to leave in place. Only restore a DB
# backup if you must remove them.
```

### 4.3 What the issue-reporting change touches at deploy time

| Concern | Detail |
|---|---|
| **Migration** | `20260909003626_add_issue_reports` — adds the `issue_reports` table + 3 enums. Additive; applied automatically by the entrypoint. |
| **New env vars** | `GITHUB_ISSUES_ENABLED`, `GITHUB_ISSUES_REPO`, `GITHUB_TOKEN`, `GITHUB_ISSUES_DEFAULT_LABELS`, `ISSUE_SYNC_DISABLED` — all optional, wired into `docker-compose.yml`. With `GITHUB_ISSUES_ENABLED=0` (default) the feature still works: reports are stored in the DB and the "Report issue" button + `/issues` page function; nothing is sent to GitHub. |
| **Enabling GitHub sync** | Create a fine-grained PAT (single repo, **Issues: Read and write**), put it in `.env` as `GITHUB_TOKEN`, set `GITHUB_ISSUES_REPO` and `GITHUB_ISSUES_ENABLED=1`, restart `backend`. The boot catch-up run flushes any reports queued while it was off. |
| **Background job** | Hourly cron + boot catch-up, same single-container caveat as the license job — disable on all but one replica with `ISSUE_SYNC_DISABLED=1`. No-op until GitHub is configured. |
| **Outbound network** | The backend container now makes HTTPS calls to `api.github.com` when sync is enabled. |

---

## 5. Environment variable reference

Set in `/opt/campaign-buddy/.env` (read by `docker-compose.yml`).

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` | `postgres` | DB user |
| `POSTGRES_PASSWORD` | `postgres` | **Change in production.** |
| `POSTGRES_DB` | `campaign_buddy` | DB name |
| `STAFF_JWT_SECRET` | `change-me-staff-secret` | **Change.** Signs mobile (`/v1`) tokens |
| `STAFF_JWT_EXPIRES_IN` | `86400` | Mobile access-token TTL (seconds) |
| `STAFF_REFRESH_TOKEN_TTL_DAYS` | `30` | Mobile refresh-token TTL (days) |
| `USER_JWT_SECRET` | `change-me-user-secret` | **Change.** Signs portal (`/admin/v1`) tokens |
| `USER_JWT_EXPIRES_IN` | `8h` | Portal token TTL |
| `BCRYPT_SALT_ROUNDS` | `10` | Password hash cost |
| `LICENSE_WARN_THRESHOLD_PCT` | `80` | Global "near limit" threshold (% of cap) when a campaign has no per-campaign override. 1–99. |
| `LICENSE_SNAPSHOT_DISABLED` | `0` | `1` disables the daily license-usage snapshot job |
| `GITHUB_ISSUES_ENABLED` | `0` | `1` mirrors portal issue reports to GitHub Issues (needs `GITHUB_TOKEN` + `GITHUB_ISSUES_REPO`). Off = reports are stored in the DB only. |
| `GITHUB_ISSUES_REPO` | *(empty)* | `owner/repo` that portal issue reports open in |
| `GITHUB_TOKEN` | *(empty)* | Fine-grained PAT with **Issues: Read and write** on that repo. **Secret.** |
| `GITHUB_ISSUES_DEFAULT_LABELS` | `portal,from-portal` | Labels applied to every portal-filed issue |
| `ISSUE_SYNC_DISABLED` | `0` | `1` disables the hourly issue-report retry job |
| `TZ` | `Asia/Colombo` | Backend container timezone; the snapshot job's week/month boundaries |
| `CLOUDFLARED_TUNNEL_TOKEN` | *(empty)* | Cloudflare tunnel token — **never commit a real value** |

Frontend build-time variables (baked into the bundle, not runtime):

| App | Variable | Notes |
|---|---|---|
| `campaign-buddy-portal` | `VITE_API_BASE_URL` | Blank = same-origin (nginx proxy). Set to the API origin only for a split deploy. |
| `campaign-buddy-app` | `EXPO_PUBLIC_API_BASE_URL` | The backend `/v1` base URL, baked at build time. |

---

## 6. Database: migrations & seeding

- **Migrations** live in `campaign-buddy-backend/prisma/migrations/`. Production
  applies them with `prisma migrate deploy` (never `migrate dev`) — done
  automatically by `entrypoint.sh` on container start.
- **Check status:** `docker compose exec backend ./node_modules/.bin/prisma migrate status`
- **Apply manually** (if the entrypoint is bypassed):
  `docker compose exec backend ./node_modules/.bin/prisma migrate deploy`
- **Seed** is idempotent and runs on every start. To re-run:
  `docker compose exec backend node dist/prisma/seed.js`
- **Never** run `prisma migrate reset` or `docker compose down -v` in production —
  both destroy data.

Current migration chain:

```
20260906185453_init
20260906190437_campaign_status_manual_override
20260908152251_add_custom_sales_fields
20260908171132_add_license_usage_tracking      ← License Usage Tracking
```

---

## 7. Backups & maintenance

### Backup

```bash
docker exec campaign-buddy-v2-postgres-1 \
  pg_dump -U postgres campaign_buddy | gzip > backup_$(date +%Y%m%d_%H%M).sql.gz
```

Automate via cron on the host, e.g. nightly, keep 14 days.

### Restore

```bash
gunzip -c backup_YYYYMMDD_HHMM.sql.gz | \
  docker exec -i campaign-buddy-v2-postgres-1 psql -U postgres campaign_buddy
```

### Logs

```bash
docker compose logs -f backend
docker compose logs -f portal
docker compose logs -f postgres
docker compose logs backend | grep license-snapshot   # snapshot job runs
```

### Restart / update

```bash
docker compose restart backend
# after a git pull:
docker compose -f docker-compose.yml --profile production up -d --build
```

---

## 8. Mobile app distribution

The Expo app is **not** part of the Docker stack. For local/testing use Expo Go
(§2.4). For store or ad-hoc distribution you need an EAS build config
(`eas.json`, not yet in the repo) and an Expo account:

```bash
cd campaign-buddy-app
npx expo login
npx eas build:configure          # creates eas.json (one-time)
# set EXPO_PUBLIC_API_BASE_URL to the production API URL for the build profile
npx eas build --platform android
npx eas build --platform ios     # needs an Apple Developer account
```

Bundle identifiers are already set in `app.json`
(`com.dyuro.campaignbuddy`).

---

## 9. Production checklist

- [ ] `POSTGRES_PASSWORD` set to a strong value
- [ ] `STAFF_JWT_SECRET` and `USER_JWT_SECRET` set to distinct 32-byte random hex
- [ ] `.env` is **not** committed (it is gitignored; verify `git status`)
- [ ] **Rotate the Cloudflare tunnel token** — a real token was committed to
      `.env.example` in git history; revoke it in the Cloudflare dashboard and
      issue a fresh one for `.env` only
- [ ] Default `admin` / `sktest` passwords changed after first login
- [ ] Tunnel hostname resolves and `/health` returns `ok` over HTTPS
- [ ] `prisma migrate status` shows all migrations applied
- [ ] Nightly `pg_dump` backup cron in place, retention set
- [ ] Docker log rotation configured (`/etc/docker/daemon.json` → `log-opts`)
- [ ] Disk-space alert on the VPS (Postgres volume + image layers)
- [ ] Backend runs as a **single** instance, or the snapshot job is disabled on
      all but one

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Backend restarts / `migrate deploy` fails | `docker compose logs backend`. Usually Postgres wasn't ready — `docker compose restart backend`. If a migration errored, restore the pre-upgrade backup and investigate. |
| Portal loads but API calls 502 | nginx can't reach `backend:4000`. `docker compose ps`; check the backend is Up and on the same compose network. |
| Login "Invalid credentials" on a fresh DB | Seed didn't run: `docker compose exec backend node dist/prisma/seed.js`. |
| **License Usage** page empty / 500 | Confirm `20260908171132_add_license_usage_tracking` applied (`prisma migrate status`). Rebuild the backend image if `node-cron` is missing (`Cannot find module 'node-cron'`). |
| License snapshot history stays empty | The job writes at 00:15 `TZ` and once on boot. Check `docker compose logs backend | grep license-snapshot`; verify `LICENSE_SNAPSHOT_DISABLED` is not `1`. |
| Snapshot job logs a timezone error | Ensure `TZ=Asia/Colombo` is set on the backend service (it is in `docker-compose.yml`); `node:20-alpine` ships full ICU so `Asia/Colombo` resolves. |
| Port already in use (local) | `ss -tlnp | grep -E '4000|5173|5432'`, or edit `docker-compose.override.yml`. |
