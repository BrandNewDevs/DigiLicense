import { prisma } from "../src/db.ts"
import { purgeExpiredMobileChanges } from "../src/mobile-change-retention.ts"
import { runMaintenanceCleanup } from "../src/maintenance-telemetry.ts"

try {
  await runMaintenanceCleanup(
    "mobile_change_retention_purge",
    purgeExpiredMobileChanges
  )
} finally {
  await prisma.$disconnect()
}
