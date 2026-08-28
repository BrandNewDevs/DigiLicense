import { PrismaClient } from "./generated/prisma/client"

import { createDatabaseAdapter } from "./database-adapter.ts"
import { validateDatabaseUrl } from "./database-url.ts"

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.")
  }

  const check = validateDatabaseUrl(databaseUrl)

  if (!check.ok) {
    throw new Error(check.message)
  }

  return databaseUrl
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: createDatabaseAdapter(getDatabaseUrl()),
    transactionOptions: {
      maxWait: 5_000,
      timeout: 10_000,
    },
  })
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: ReturnType<typeof createPrismaClient>
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export { prisma }
