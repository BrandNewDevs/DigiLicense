import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaPg } from "@prisma/adapter-pg"

import { validateDatabaseUrl } from "./database-url.ts"

function createDatabaseAdapter(databaseUrl: string) {
  const check = validateDatabaseUrl(databaseUrl)

  if (!check.ok) {
    throw new Error(check.message)
  }

  const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "")

  // `db` is the local PostgreSQL service name on the Docker Compose network.
  // Hosted databases continue through the Neon adapter.
  if (["localhost", "127.0.0.1", "::1", "db"].includes(hostname)) {
    return new PrismaPg({ connectionString: databaseUrl })
  }

  return new PrismaNeon({ connectionString: databaseUrl })
}

export { createDatabaseAdapter }
