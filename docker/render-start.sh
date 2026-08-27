#!/bin/sh
set -e

echo "Running database migrations..."
cd /workspace/packages/db
./node_modules/.bin/prisma migrate deploy

echo "Seeding synthetic records..."
./node_modules/.bin/tsx prisma/seed.ts

echo "Starting server..."
exec node /workspace/apps/web/dist/server/server.js
