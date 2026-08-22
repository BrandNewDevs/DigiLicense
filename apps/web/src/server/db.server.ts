import "@tanstack/react-start/server-only"

import { PrismaClient } from "@/generated/prisma/client"

import { createDatabaseAdapter } from "./database-adapter"

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.")
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(databaseUrl)
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.")
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres or postgresql protocol."
    )
  }

  return databaseUrl
}

function createPrismaClient() {
  const adapter = createDatabaseAdapter(getDatabaseUrl())

  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: ReturnType<typeof createPrismaClient>
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export { prisma }
