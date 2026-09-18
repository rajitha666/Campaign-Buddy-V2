# Docker Deployment Guide

## Tech Stack
- **Backend**: Node 20, TypeScript, Express, PostgreSQL 16, Prisma
- **Portal**: React 18, Vite 5, Nginx
- **Infrastructure**: Docker, Cloudflared tunnel

## Quick Start

### 1. Create Cloudflare Tunnel

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** → **Tunnels**
3. Click **Create a tunnel** → choose **Cloudflared**
4. Name your tunnel (e.g., `campaign-buddy`)
5. Copy the **tunnel token** (you'll need it in step 3)
6. Configure public hostnames:
   - **Portal**: `your-domain.com` → `http://portal:80`
   - **Backend API**: `api.your-domain.com` → `http://backend:4000`

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `POSTGRES_PASSWORD`: Strong password for PostgreSQL
- `STAFF_JWT_SECRET`: Random secret for staff JWT tokens
- `USER_JWT_SECRET`: Random secret for user JWT tokens
- `CLOUDFLARED_TUNNEL_TOKEN`: Your tunnel token from step 1

### 3. Deploy

**For production (Hetzner VPS):**
```bash
docker compose --profile production up -d
```

**For local testing (exposes ports to localhost):**
```bash
docker compose up -d
```

The override file automatically exposes:
- Portal: http://localhost:5173
- Backend API: http://localhost:4000
- PostgreSQL: localhost:5432

Note: Cloudflared only runs with the `production` profile, so it won't start locally.

### 4. Initialize Database

On first run, the backend automatically runs migrations. To seed demo data:

```bash
docker compose exec backend npx prisma db seed
```

## Architecture

```
Cloudflare Tunnel
    ↓
┌─────────────────────────────────────┐
│  portal (nginx:80)                  │
│  - Serves React SPA                 │
│  - Proxies /admin/v1/* to backend   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  backend (node:4000)                │
│  - Express API                      │
│  - Prisma ORM                       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  postgres (5432)                    │
│  - PostgreSQL 16                    │
└─────────────────────────────────────┘
```

## Useful Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f portal

# Restart services
docker compose restart backend

# Run database migrations manually
docker compose exec backend npx prisma migrate deploy

# Access PostgreSQL
docker compose exec postgres psql -U postgres -d campaign_buddy

# Rebuild after code changes
docker compose build --no-cache
docker compose up -d

# Production: rebuild with cloudflared
docker compose --profile production build --no-cache
docker compose --profile production up -d

# Stop everything
docker compose down

# Stop and remove volumes (destroys data)
docker compose down -v
```

## Local Development

For active development, use the override file which exposes ports:

```bash
# Start with port bindings
docker compose up -d

# Backend auto-reloads with ts-node-dev
# Portal requires rebuild:
docker compose build portal && docker compose up -d portal
```

## Production Checklist

### VPS update/shortcut script

`deploy-prod.sh` wraps the usual code-change flow (`up -d --build` under the
`production` profile):

```bash
./deploy-prod.sh            # rebuild + restart backend & portal (the default)
./deploy-prod.sh portal     # rebuild + restart just one service
./deploy-prod.sh ""         # up the full stack incl. cloudflared (first boot)
```

It intentionally has no `down`/teardown — DB volume teardown is manual (see
`deploy/README.md`; never `down -v` on the postgres volume).

### Local develop with my docker proxy (optional)

Developers running the shared `~/Projects/docker-proxy` Traefik can route the
dev stack through it with `./dev.sh` (dev-only, no teardown):

```bash
./dev.sh up                 # normal localhost-port dev stack
./dev.sh stop               # stop all services (volumes kept)
./dev.sh start              # resume after stop
./dev.sh logs backend       # follow a service's logs
./dev.sh ps                 # status

./dev.sh --proxy up         # route through docker-proxy instead (needs it running)
```

With the proxy mode the stack is reachable at:

- `office.campaignbuddy.localhost` → portal
- `app.campaignbuddy.localhost` → CB Mobile web build
- `api.campaignbuddy.localhost` → backend
- `marketing.campaignbuddy.localhost` → marketing
- `studio.campaignbuddy.localhost` → Prisma Studio

(`.localhost` domains resolve to 127.0.0.1 automatically — no `/etc/hosts`
edits; router names are prefixed `cb-` to avoid clashes on the shared proxy.)

Developers without docker-proxy just ignore `--proxy`/`docker-compose.proxy.yml`
— the plain two-file dev workflow works unchanged.


- [ ] Change all JWT secrets to strong random values
- [ ] Set strong PostgreSQL password
- [ ] Configure Cloudflare tunnel with correct hostnames
- [ ] Enable HTTPS in Cloudflare (automatic with tunnel)
- [ ] Set up database backups
- [ ] Configure monitoring/logging
