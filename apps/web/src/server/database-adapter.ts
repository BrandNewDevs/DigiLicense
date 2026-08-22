import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaPg } from "@prisma/adapter-pg"

import { validateDatabaseUrl } from "./database-url"

function createDatabaseAdapter(databaseUrl: string) {
  const check = validateDatabaseUrl(databaseUrl)

  if (!check.ok) {
    throw new Error(check.message)
  }

  const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "")

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return new PrismaPg({ connectionString: databaseUrl })
  }

  return new PrismaNeon({ connectionString: databaseUrl })
}

export { createDatabaseAdapter }
