#!/bin/sh
set -eu

cd /workspace

pnpm --filter @digilicense/db db:process-appointment-offers
pnpm --filter @digilicense/db db:process-address-reviews

# The purge command is idempotent and drains all expired workflow records.
# Running it with the minute workers avoids a second paid scheduler service.
pnpm --filter @digilicense/db db:purge-expired-workflow-records
