#!/usr/bin/env node
// Stop the local stack while keeping all data (the postgres_data volume).
//
//   node scripts/dev-stop.mjs    (or: pnpm dev:stop)
//
// Start it again with `pnpm dev:setup` (safe to re-run) or `docker compose up -d`.

import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

execSync("docker compose down --remove-orphans", {
  cwd: repoRoot,
  stdio: "inherit",
})
