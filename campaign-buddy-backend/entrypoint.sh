#!/bin/sh
set -e

PRISMA="./node_modules/.bin/prisma"

$PRISMA migrate deploy

echo "Running seed (idempotent)..."
node dist/prisma/seed.js || echo "Seed skipped or failed, continuing..."

exec node dist/src/server.js
