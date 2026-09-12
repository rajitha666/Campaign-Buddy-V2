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
