import { prisma } from "./db"

const draftRetentionBatchSize = 500

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

  // Do not cap batches. A capped run can leave expired form data behind during
  // a backlog, which would defeat the retention policy. This job drains until
  // no unlocked expired drafts remain.
  while (true) {
    const deletedInBatch = await deleteExpiredDraftBatch()

    batches += 1
    deleted += deletedInBatch

    if (deletedInBatch < draftRetentionBatchSize) {
      break
    }
  }

  return { deleted, batches }
}

export { draftRetentionBatchSize, purgeExpiredApplicationDrafts }
export type { PurgeExpiredDraftsResult }
