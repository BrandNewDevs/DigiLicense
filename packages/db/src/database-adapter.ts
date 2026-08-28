import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaPg } from "@prisma/adapter-pg"

import { validateDatabaseUrl } from "./database-url.ts"

const databaseStatementTimeoutMs = 10_000

function withDatabaseStatementTimeout(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  const hostname = url.hostname.replace(/^\[|\]$/g, "")

  // Neon pooled connections reject PostgreSQL startup `options`, including
  // statement_timeout. Request and interactive-transaction deadlines remain
  // bounded by the application and Prisma transaction configuration.
  if (hostname.endsWith(".neon.tech") && hostname.includes("-pooler.")) {
    return url.toString()
  }

  const timeoutOption = `-c statement_timeout=${databaseStatementTimeoutMs}`
  const existingOptions = url.searchParams.get("options")?.trim()

  if (!existingOptions?.includes("statement_timeout")) {
    url.searchParams.set(
      "options",
      [existingOptions, timeoutOption].filter(Boolean).join(" ")
    )
  }

  return url.toString()
}

function createDatabaseAdapter(databaseUrl: string) {
  const check = validateDatabaseUrl(databaseUrl)

  if (!check.ok) {
    throw new Error(check.message)
  }

  const connectionString = withDatabaseStatementTimeout(databaseUrl)
  const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, "")

  // `db` is the local PostgreSQL service name on the Docker Compose network.
  // Hosted databases continue through the Neon adapter.
  if (["localhost", "127.0.0.1", "::1", "db"].includes(hostname)) {
    return new PrismaPg({ connectionString })
  }

  return new PrismaNeon({ connectionString })
}

export {
  createDatabaseAdapter,
  databaseStatementTimeoutMs,
  withDatabaseStatementTimeout,
}
