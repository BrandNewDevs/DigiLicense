import { prisma } from "./db"

const addressChangeRetentionBatchSize = 500
const addressChangeVerificationRetentionMs = 24 * 60 * 60_000

type PurgeExpiredAddressChangeVerificationsResult = {
  batches: number
  deleted: number
}

async function deleteExpiredAddressChangeVerificationBatch(): Promise<number> {
  return prisma.$executeRaw`
    WITH expired_verifications AS (
      SELECT "id"
      FROM "AddressChangeVerification"
      WHERE "expiresAt" < ${new Date(Date.now() - addressChangeVerificationRetentionMs)}
        AND "status" IN ('LOCKED', 'EXPIRED', 'CONSUMED', 'CANCELLED')
      ORDER BY "expiresAt"
      LIMIT ${addressChangeRetentionBatchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "AddressChangeVerification"
    WHERE "id" IN (SELECT "id" FROM expired_verifications)
  `
}

async function purgeExpiredAddressChangeVerifications(): Promise<PurgeExpiredAddressChangeVerificationsResult> {
  let batches = 0
  let deleted = 0

  while (true) {
    const deletedInBatch = await deleteExpiredAddressChangeVerificationBatch()
    batches += 1
    deleted += deletedInBatch
    if (deletedInBatch < addressChangeRetentionBatchSize) break
  }

  return { batches, deleted }
}

export {
  addressChangeRetentionBatchSize,
  purgeExpiredAddressChangeVerifications,
}
export type { PurgeExpiredAddressChangeVerificationsResult }
