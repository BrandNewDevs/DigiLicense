import { processAppointmentOfferLifecycle } from "../src/appointment-allocation.ts"
import { prisma } from "../src/db.ts"

try {
  const result = await processAppointmentOfferLifecycle()
  console.info(
    JSON.stringify({
      event: "appointment_offer_lifecycle_completed",
      expiredCount: result.expiredCount,
      offeredCount: result.offeredCount,
      reactivatedCount: result.reactivatedCount,
      scannedSlotCount: result.scannedSlotCount,
      severity: "info",
      timestamp: new Date().toISOString(),
    })
  )
} catch (error) {
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : "UnknownError",
      event: "appointment_offer_lifecycle_failed",
      severity: "error",
      timestamp: new Date().toISOString(),
    })
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
