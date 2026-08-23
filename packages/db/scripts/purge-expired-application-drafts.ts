import { fileURLToPath } from "node:url"

import { config } from "dotenv"

config({
  path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)),
})

const { purgeExpiredApplicationDrafts } =
  await import("../src/draft-retention.ts")

try {
  const result = await purgeExpiredApplicationDrafts()

  console.info(
    JSON.stringify({
      operation: "application_draft_retention_purge",
      ...result,
    })
  )
} finally {
  const { prisma } = await import("../src/db.ts")
  await prisma.$disconnect()
}
