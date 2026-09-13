# VPS deployment guide

## Required configuration

Copy `.env.example` to `.env` in the repo root and fill in **all** of these
before the first `docker compose up`:

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | **Yes** | Must be a strong, real password. See warning below. |
| `POSTGRES_USER` | Recommended | Defaults to `postgres`. |
| `POSTGRES_DB` | Recommended | Defaults to `campaign_buddy`. |
| `STAFF_JWT_SECRET` | **Yes** | Long random string (`openssl rand -hex 32`). |
| `USER_JWT_SECRET` | **Yes** | Long random string, different from staff secret. |
| `CLOUDFLARED_TUNNEL_TOKEN` | **Yes** (prod) | From Cloudflare Zero Trust > Tunnels. Only needed for the `production` profile. |

Optional: `TZ`, `LICENSE_*`, `GITHUB_*`, `ISSUE_SYNC_DISABLED` — see
`docker-compose.yml` comments.

> **`POSTGRES_PASSWORD` only takes effect when the `postgres_data` volume is
> first created.** Changing it in `.env` later does NOT change the password
> inside the existing database. If they drift apart, the backend fails with
> Prisma error `P1000` ("credentials are not valid").

## First deploy

```bash
cp .env.example .env        # then edit .env with real values
docker compose --profile production up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

## If the DB password has drifted (P1000 on login)

Reset the password inside the running container (local socket = no password
needed), then make `.env` match:

```bash
docker compose exec postgres psql -U postgres \
  -c "ALTER USER postgres PASSWORD '<value-from-.env>';"
```

If `psql` itself fails (e.g. role can't log in), use single-user mode against
the **existing** volume — note the volume name is lowercased by Docker
(check with `docker volume ls`):

```bash
docker compose stop postgres
docker run --rm -it \
  -v campaign-buddy-v2_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine \
  postgres --single -D /var/lib/postgresql/data postgres
-- at the prompt:
ALTER ROLE postgres WITH LOGIN PASSWORD '<value-from-.env>';
\q
docker compose --profile production up -d
```

## Rules to avoid repeating this outage

1. The root `.env` is the **single source of truth** for
   `POSTGRES_PASSWORD` — keep it in a password manager; never rely on the
   compose default (`postgres`).
2. Never run `docker compose down -v` or `docker volume rm` on the postgres
   volume unless you intend to wipe all data (that's the only time a new
   `POSTGRES_PASSWORD` gets picked up).
3. After any compose/env change, verify both sides agree:
   ```bash
   docker compose exec postgres env | grep POSTGRES_PASSWORD
   docker compose exec backend  env | grep DATABASE_URL
   ```
4. Always start the stack with `--profile production` on the VPS (brings up
   `cloudflared` for the tunnel).

## Portal losing its connection to the backend (502 / API calls fail)

**Cause**: `campaign-buddy-portal/nginx.conf` proxies `/admin/v1`, `/v1`, and
`/health` to the `backend` container by Docker Compose service name. Plain
nginx resolves that hostname to an IP **once, at startup**, and caches it for
the container's lifetime. Any time the `backend` container is recreated on
its own — a crash + `restart: unless-stopped`, or a routine
`docker compose up -d --build backend` — it gets a new internal IP, but the
already-running `portal` container keeps sending traffic to the old, dead
one. The portal then errors out until someone manually restarts it too.

**Fix (already applied)**: `nginx.conf` uses Docker's embedded DNS resolver
(`127.0.0.11`) with a short TTL and a `set $backend_upstream ...` variable in
front of each `proxy_pass`, so nginx re-resolves `backend`/`marketing`
periodically instead of caching the IP forever. With this in place, `portal`
self-heals within ~10s of a backend restart — no manual restart needed.

If you ever see the disconnect again:
- Confirm `portal`'s `nginx.conf` still has the `resolver 127.0.0.11 valid=10s;`
  + `set $backend_upstream ...` pattern (not a bare `proxy_pass http://backend:4000/...`).
- As an immediate workaround, `docker compose restart portal` picks up the
  backend's current IP right away.
- Rebuild the `portal` image after any `nginx.conf` change — it's baked into
  the image at build time, not mounted live.
