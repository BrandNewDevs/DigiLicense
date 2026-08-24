import { purgeExpiredMobileChanges } from "../src/mobile-change-retention.ts"

const result = await purgeExpiredMobileChanges()
console.info(JSON.stringify({ operation: "mobile_change_retention_purge", ...result }))
