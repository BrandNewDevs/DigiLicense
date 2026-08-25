#!/usr/bin/env node
// Full local reset: deletes all local synthetic data (the Postgres volume),
// rebuilds the stack, reapplies migrations, and reseeds demo data.
//
//   node scripts/dev-reset.mjs    (or: pnpm reset)
//
// This is deliberately destructive for local development only. It never
// touches any non-local environment because every value lives in the ignored
// root .env and the Compose project in this repository.

import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

execSync("docker compose down --remove-orphans --volumes", {
  cwd: repoRoot,
  stdio: "inherit",
})

execSync("node scripts/dev-setup.mjs", {
  cwd: repoRoot,
  stdio: "inherit",
})
