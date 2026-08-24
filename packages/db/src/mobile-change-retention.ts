import { prisma } from "./db"

const mobileChangeRetentionBatchSize = 500
const mobileChangeRetentionMs = 24 * 60 * 60_000

type PurgeExpiredMobileChangesResult = {
  deleted: number
  batches: number
}

async function deleteExpiredMobileChangeBatch(): Promise<number> {
  return prisma.$executeRaw`
    WITH expired_requests AS (
      SELECT "id"
      FROM "MobileChangeRequest"
      WHERE "expiresAt" < ${new Date(Date.now() - mobileChangeRetentionMs)}
        AND "status" IN ('COMPLETED', 'FAILED', 'LOCKED', 'EXPIRED', 'CANCELLED')
      ORDER BY "expiresAt"
      LIMIT ${mobileChangeRetentionBatchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "MobileChangeRequest"
    WHERE "id" IN (SELECT "id" FROM expired_requests)
  `
}

async function purgeExpiredMobileChanges(): Promise<PurgeExpiredMobileChangesResult> {
  let deleted = 0
  let batches = 0

  while (true) {
    const deletedInBatch = await deleteExpiredMobileChangeBatch()
    deleted += deletedInBatch
    batches += 1

    if (deletedInBatch < mobileChangeRetentionBatchSize) break
  }

  return { deleted, batches }
}

export {
  mobileChangeRetentionBatchSize,
  purgeExpiredMobileChanges,
}
export type { PurgeExpiredMobileChangesResult }
