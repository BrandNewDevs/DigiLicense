import { prisma } from "./db"

const draftRetentionBatchSize = 500
const draftRetentionMaximumBatches = 20

type PurgeExpiredDraftsResult = {
  deleted: number
  batches: number
}

// This statement locks only the selected batch. Concurrent scheduled runs can
// therefore make progress without deleting the same draft twice.
async function deleteExpiredDraftBatch(): Promise<number> {
  return prisma.$executeRaw`
    WITH expired_drafts AS (
      SELECT "id"
      FROM "ApplicationDraft"
      WHERE "expiresAt" <= CURRENT_TIMESTAMP
      ORDER BY "expiresAt"
      LIMIT ${draftRetentionBatchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "ApplicationDraft"
    WHERE "id" IN (SELECT "id" FROM expired_drafts)
  `
}

async function purgeExpiredApplicationDrafts(): Promise<PurgeExpiredDraftsResult> {
  let deleted = 0
  let batches = 0

  while (batches < draftRetentionMaximumBatches) {
    const deletedInBatch = await deleteExpiredDraftBatch()

    batches += 1
    deleted += deletedInBatch

    if (deletedInBatch < draftRetentionBatchSize) {
      break
    }
  }

  return { deleted, batches }
}

export {
  draftRetentionBatchSize,
  draftRetentionMaximumBatches,
  purgeExpiredApplicationDrafts,
}
export type { PurgeExpiredDraftsResult }
