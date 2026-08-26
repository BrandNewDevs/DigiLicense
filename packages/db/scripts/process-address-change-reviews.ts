import { processDueAddressChangeReviews } from "../src/address-change-review.ts"

try {
  const result = await processDueAddressChangeReviews()
  console.info(
    JSON.stringify({
      event: "address_change_review_completed",
      processedCount: result.processedCount,
      severity: "info",
      timestamp: new Date().toISOString(),
    })
  )
} catch (error) {
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : "UnknownError",
      event: "address_change_review_failed",
      severity: "error",
      timestamp: new Date().toISOString(),
    })
  )
  process.exitCode = 1
}
