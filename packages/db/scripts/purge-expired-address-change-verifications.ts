import { prisma } from "../src/db"
import { purgeExpiredAddressChangeVerifications } from "../src/address-change-retention"
import { runMaintenanceCleanup } from "../src/maintenance-telemetry"

try {
  await runMaintenanceCleanup(
    "address_change_verification_retention_purge",
    purgeExpiredAddressChangeVerifications
  )
} finally {
  await prisma.$disconnect()
}
