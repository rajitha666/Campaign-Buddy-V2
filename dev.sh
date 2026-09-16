#!/usr/bin/env bash
# Shortcut for the local dev stack. Does NOT tear anything down — for
# `docker compose down` run it manually against the same -f files.
#
#   ./dev.sh up              start / rebuild changed images
#   ./dev.sh up backend      rebuild + restart just the backend
#   ./dev.sh stop            stop all services (volumes kept)
#   ./dev.sh start           resume after stop
#   ./dev.sh logs [service]  follow logs
#   ./dev.sh ps              status
#   ./dev.sh --proxy up      route through the shared docker-proxy Traefik
#                            (requires ~/Projects/docker-proxy running)
set -e
cd "$(dirname "$0")"

proxy=""
if [[ "$1" == "--proxy" ]]; then
  proxy="-f docker-compose.proxy.yml"
  shift
fi

cmd="$1"; shift

files=(-f docker-compose.yml -f docker-compose.dev.yml $proxy)

case "$cmd" in
  up)    exec docker compose "${files[@]}" up -d --build "$@" ;;
  start) exec docker compose "${files[@]}" start "$@" ;;
  stop)  exec docker compose "${files[@]}" stop "$@" ;;
  logs)  exec docker compose "${files[@]}" logs -f "$@" ;;
  ps)    exec docker compose "${files[@]}" ps "$@" ;;
  *)     echo "usage: dev.sh [--proxy] {up|start|stop|logs|ps} [args]" >&2; exit 1 ;;
esac
