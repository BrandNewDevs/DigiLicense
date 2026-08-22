import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaPg } from "@prisma/adapter-pg"

function createDatabaseAdapter(databaseUrl: string) {
  const hostname = new URL(databaseUrl).hostname

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return new PrismaPg({ connectionString: databaseUrl })
  }

  return new PrismaNeon({ connectionString: databaseUrl })
}

export { createDatabaseAdapter }
