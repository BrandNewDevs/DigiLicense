#!/usr/bin/env node
// One-command local development setup.
//
//   node scripts/dev-setup.mjs        (or: pnpm dev:setup)
//
// What it does:
//  1. Creates the ignored root .env with freshly generated secrets when it is
//     missing or still holds example placeholders.
//  2. Creates apps/web/.env for host-side Prisma commands, reusing the same
//     local database password so both files stay in sync automatically.
//     (Docker Compose overrides DATABASE_URL inside containers, so the
//     localhost URL written here only affects commands run on the host.)
//  3. Builds and starts the Compose stack (web, PostgreSQL, Adminer).
//  4. Applies checked-in migrations and seeds synthetic demo data.
//
// The script is idempotent: running it again keeps existing secrets and data
// and simply reports that the stack is ready.

import { execSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

const rootEnvPath = `${repoRoot}.env`
const rootEnvExamplePath = `${repoRoot}.env.example`
const webEnvPath = `${repoRoot}apps/web/.env`

function run(command, options = {}) {
  console.log(`\n$ ${command}`)
  execSync(command, {
    cwd: repoRoot,
    stdio: options.quiet ? "pipe" : "inherit",
    ...options,
  })
}

function readEnvFile(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null
}

function parseEnvValue(content, key) {
  const match = content.match(new RegExp(`^${key}="?(.*?)"?$`, "m"))
  return match?.[1] ?? null
}

function upsertEnvValue(content, key, value) {
  const line = `${key}="${value}"`

  if (new RegExp(`^${key}=`, "m").test(content)) {
    return content.replace(
      new RegExp(`^${key}=.*$`, "m"),
      line.replace(/\$/g, "$$$$")
    )
  }

  const separator = content.endsWith("\n") || content === "" ? "" : "\n"
  return `${content}${separator}${line}\n`
}

function isPlaceholderOrMissing(value) {
  return !value || value.includes("replace-with")
}

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString("hex")
}

// 1. Root .env owns the single source of truth for local secrets.
let rootEnvContent = readEnvFile(rootEnvPath)

if (rootEnvContent === null) {
  const example = readEnvFile(rootEnvExamplePath) ?? ""
  writeFileSync(rootEnvPath, example)
  rootEnvContent = example
}

const existingPassword = parseEnvValue(rootEnvContent, "DIGILICENSE_LOCAL_DB_PASSWORD")
const existingSessionSecret = parseEnvValue(rootEnvContent, "DIGILICENSE_SESSION_SECRET")

const dbPassword = isPlaceholderOrMissing(existingPassword)
  ? generateSecret(24)
  : existingPassword
const sessionSecret = isPlaceholderOrMissing(existingSessionSecret)
  ? generateSecret(48)
  : existingSessionSecret

if (dbPassword !== existingPassword || sessionSecret !== existingSessionSecret) {
  let nextContent = rootEnvContent
  nextContent = upsertEnvValue(nextContent, "DIGILICENSE_LOCAL_DB_PASSWORD", dbPassword)
  nextContent = upsertEnvValue(nextContent, "DIGILICENSE_SESSION_SECRET", sessionSecret)
  writeFileSync(rootEnvPath, nextContent)
  console.log("Wrote fresh local secrets to .env")
} else {
  console.log(".env already holds real local secrets; keeping them.")
}

// 2. apps/web/.env mirrors the same local password at localhost so Prisma
// commands on the host work without any manual copying.
let webEnvContent =
  readEnvFile(webEnvPath) ?? readEnvFile(`${repoRoot}apps/web/.env.example`) ?? ""

const hostDatabaseUrl = `postgresql://digilicense:${dbPassword}@localhost:5432/digilicense?sslmode=require&uselibpqcompat=true`

if (parseEnvValue(webEnvContent, "DATABASE_URL") !== hostDatabaseUrl) {
  webEnvContent = upsertEnvValue(webEnvContent, "DATABASE_URL", hostDatabaseUrl)
}
if (parseEnvValue(webEnvContent, "DIGILICENSE_SESSION_SECRET") !== sessionSecret) {
  webEnvContent = upsertEnvValue(webEnvContent, "DIGILICENSE_SESSION_SECRET", sessionSecret)
}
writeFileSync(webEnvPath, webEnvContent)
console.log("Synced apps/web/.env with the local database credentials.")

// 3. Build and start the stack.
run("docker compose version", { quiet: true }) // fail fast with a clear error if Docker is missing
run("docker compose up -d --build")

// 4. Wait for PostgreSQL with a hard deadline so a broken database fails the
// script instead of hanging forever.
const readinessTimeoutMs = 60_000

console.log("\nWaiting for PostgreSQL to accept connections...")
{
  const deadline = Date.now() + readinessTimeoutMs
  let ready = false

  while (!ready) {
    if (Date.now() > deadline) {
      console.error(
        `PostgreSQL was not ready within ${readinessTimeoutMs / 1000} seconds.`
      )
      // Surface the diagnostics a developer needs before exiting non-zero.
      run("docker compose ps")
      run("docker compose logs --tail 50 db")
      console.error(
        "Review the output above. After fixing the database, re-run `pnpm dev:setup`."
      )
      process.exit(1)
    }

    let result = ""

    try {
      result = execSync(
        'docker compose exec -T db sh -c "pg_isready -U digilicense -d digilicense"',
        { cwd: repoRoot, stdio: "pipe" }
      )
        .toString()
        .trim()
    } catch (error) {
      // pg_isready exits non-zero while starting up; capture whatever it said.
      result = error.stdout?.toString().trim() ?? "no response yet"
    }

    if (/accepting connections/.test(result)) {
      ready = true
    } else {
      // Keep visible progress; pg_isready output doubles as the reason.
      process.stdout.write(`  ${result || "no response yet"}\r`)
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }

  process.stdout.write("\n")
}

run("docker compose exec web pnpm --filter @digilicense/db db:migrate:deploy")
run("docker compose exec web pnpm --filter @digilicense/db db:seed")
console.log("Seed data applied.")

console.log(`
Setup complete.
  App:      http://localhost:3000
  Adminer:  http://localhost:8080  (server: db, user: digilicense, database: digilicense)
  Sign in:  mobile 9000000001, OTP 123456

Useful next commands:
  pnpm dev:reset    wipe all local data and start over
  pnpm dev:stop     stop the stack, keeping data
`)
