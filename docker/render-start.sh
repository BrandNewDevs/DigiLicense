#!/bin/sh
set -e

echo "Starting server..."
cd /workspace/apps/web
exec ./node_modules/.bin/srvx --prod -s ../client dist/server/server.js
