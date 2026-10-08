#!/bin/sh
set -e

# Migrations must use a direct (non-pooled) connection; the app itself can use
# the pooled one. DIRECT_URL is optional: without it, DATABASE_URL is used.
echo "Applying database migrations..."
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy

echo "Starting CollabSpace on port ${PORT:-3000}..."
exec node server.js
