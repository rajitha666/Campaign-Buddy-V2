# Deployment Guide — Campaign Buddy V2

## Prerequisites

- VPS with Docker & Docker Compose v2 installed
- Domain name (optional, for Cloudflare Tunnel)
- SSH access to the VPS

## Quick Deploy

### 1. Clone the repository

```bash
git clone <your-repo-url> /opt/campaign-buddy
cd /opt/campaign-buddy
```

### 2. Create environment file

```bash
cp .env.example .env
```

### 3. Generate secure secrets

```bash
# Generate random secrets
STAFF_SECRET=$(openssl rand -hex 32)
USER_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)

echo "Generated secrets — save these:"
echo "  STAFF_JWT_SECRET=$STAFF_SECRET"
echo "  USER_JWT_SECRET=$USER_SECRET"
echo "  POSTGRES_PASSWORD=$PG_PASSWORD"
```

### 4. Edit `.env` with production values

```bash
nano .env
```

**Required changes:**

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your-generated-password>
POSTGRES_DB=campaign_buddy

STAFF_JWT_SECRET=<your-generated-staff-secret>
STAFF_JWT_EXPIRES_IN=86400
STAFF_REFRESH_TOKEN_TTL_DAYS=30

USER_JWT_SECRET=<your-generated-user-secret>
USER_JWT_EXPIRES_IN=8h

BCRYPT_SALT_ROUNDS=10

# Optional: Cloudflare Tunnel for public access
CLOUDFLARED_TUNNEL_TOKEN=
```

### 5. Build and start

```bash
docker compose up -d --build
```

### 6. Verify

```bash
# Check all services are running
docker compose ps

# Check backend logs
docker compose logs backend

# Test health endpoint
curl http://localhost:4000/health
```

## Access

| Service | URL |
|---------|-----|
| Portal | `http://<vps-ip>:5173` |
| Backend API | `http://<vps-ip>:4000` |

### Default Credentials (seeded automatically)

| Surface | Username | Password |
|---------|----------|----------|
| Portal | `admin` | `ChangeMe123!` |
| Mobile | `sktest` | `Field123!` |

**Change these immediately after first login!**

## Cloudflare Tunnel (Optional)

For public HTTPS access without exposing ports:

1. Create a tunnel in [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Copy the tunnel token
3. Add to `.env`:
   ```env
   CLOUDFLARED_TUNNEL_TOKEN=eyJh...
   ```
4. Restart with production profile:
   ```bash
   docker compose --profile production up -d
   ```

## Firewall (Recommended)

If not using Cloudflare Tunnel, restrict ports:

```bash
# Allow SSH
ufw allow 22

# Allow portal (if public)
ufw allow 5173

# Allow backend API (if public)
ufw allow 4000

# Enable firewall
ufw enable
```

## Maintenance

### View logs

```bash
docker compose logs -f backend
docker compose logs -f portal
docker compose logs -f postgres
```

### Restart services

```bash
docker compose restart
```

### Update deployment

```bash
git pull
docker compose up -d --build
```

### Database backup

```bash
docker exec campaign-buddy-v2-postgres-1 pg_dump -U postgres campaign_buddy > backup_$(date +%Y%m%d).sql
```

### Database restore

```bash
cat backup.sql | docker exec -i campaign-buddy-v2-postgres-1 psql -U postgres campaign_buddy
```

### Reset database (WARNING: deletes all data)

```bash
docker compose down -v
docker compose up -d
```

## Troubleshooting

### Backend won't start

```bash
# Check logs
docker compose logs backend

# Common: database not ready
# Wait for postgres healthcheck, then restart
docker compose restart backend
```

### Login fails with "Invalid credentials"

Seed data may not have loaded. Run manually:

```bash
docker exec campaign-buddy-v2-backend-1 node dist/prisma/seed.js
```

### Port already in use

```bash
# Check what's using the port
ss -tlnp | grep -E '4000|5173|5432'

# Or change ports in docker-compose.override.yml
```

## Production Checklist

- [ ] Change default admin password
- [ ] Change default mobile user password
- [ ] Set strong JWT secrets
- [ ] Set strong PostgreSQL password
- [ ] Configure firewall or Cloudflare Tunnel
- [ ] Set up database backups
- [ ] Enable log rotation
- [ ] Monitor disk space
