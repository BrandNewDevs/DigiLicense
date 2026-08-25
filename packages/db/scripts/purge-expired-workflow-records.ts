import { prisma } from "../src/db.ts"
import { purgeExpiredAddressChangeVerifications } from "../src/address-change-retention.ts"
import { purgeExpiredApplicationDrafts } from "../src/draft-retention.ts"
import { runMaintenanceCleanup } from "../src/maintenance-telemetry.ts"
import { purgeExpiredMobileChanges } from "../src/mobile-change-retention.ts"

try {
  await runMaintenanceCleanup(
    "application_draft_retention_purge",
    purgeExpiredApplicationDrafts
  )
  await runMaintenanceCleanup(
    "mobile_change_retention_purge",
    purgeExpiredMobileChanges
  )
  await runMaintenanceCleanup(
    "address_change_verification_retention_purge",
    purgeExpiredAddressChangeVerifications
  )
} finally {
  await prisma.$disconnect()
}
