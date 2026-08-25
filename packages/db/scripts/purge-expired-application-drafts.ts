import { fileURLToPath } from "node:url"

import { config } from "dotenv"

config({
  path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)),
})

const { purgeExpiredApplicationDrafts } =
  await import("../src/draft-retention.ts")
const { runMaintenanceCleanup } =
  await import("../src/maintenance-telemetry.ts")

try {
  await runMaintenanceCleanup(
    "application_draft_retention_purge",
    purgeExpiredApplicationDrafts
  )
} finally {
  const { prisma } = await import("../src/db.ts")
  await prisma.$disconnect()
}
