#!/usr/bin/env bash
# VPS deploy shortcut: rebuild + restart the requested production services.
# Intentionally has NO down/teardown — DB volume teardown is manual
# (see deploy/README.md; never `down -v` on the postgres volume).
#
#   ./deploy-prod.sh            rebuild + restart backend, portal & app (the
#                               usual code-change update: ... up -d --build backend portal app)
#   ./deploy-prod.sh portal     rebuild + restart just one service
#   ./deploy-prod.sh ""         up the full stack incl. cloudflared (first boot)
set -e
cd "$(dirname "$0")"

services="${1:-backend portal app}"
docker compose --profile production up -d --build $services
