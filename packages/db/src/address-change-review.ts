import { randomUUID } from "node:crypto"

import { prisma } from "./db.ts"

const addressChangeServiceName = "Driving-licence address change"
// The worker may select up to 100 due applications under the product
// contract. A smaller chunk keeps each interactive transaction short while
// the outer loop still drains every available due record in one run.
const addressReviewBatchSize = 25
const addressReviewTransactionMaxWaitMs = 5_000
const addressReviewTransactionTimeoutMs = 15_000
const systemActorId = "digilicense-address-review-worker"

type AddressReviewRunResult = { processedCount: number }

type DueApplication = { id: string }

function formatLicenceAddressSummary(
  locality: string,
  pincode: string
): string {
  return `${locality.replaceAll("_", " ")}, Delhi ${pincode}`
}

async function processAddressReviewBatch(now: Date): Promise<number> {
  return prisma.$transaction(
    async (transaction) => {
      const dueApplications = await transaction.$queryRaw<DueApplication[]>`
      SELECT "id"
      FROM "Application"
      WHERE "service" = ${addressChangeServiceName}
        AND "status" = 'DOCUMENT_REVIEW'::"ApplicationStatus"
        AND "statusDeadlineAt" <= ${now}
      ORDER BY "statusDeadlineAt" ASC, "id" ASC
      LIMIT ${addressReviewBatchSize}
      FOR UPDATE SKIP LOCKED
    `

      for (const due of dueApplications) {
        // Recheck the complete eligibility predicate after acquiring the row
        // lock. This keeps the transition correct if another worker changed the
        // record between candidate selection and this transaction.
        const application = await transaction.application.findFirst({
          where: {
            id: due.id,
            service: addressChangeServiceName,
            status: "DOCUMENT_REVIEW",
            statusDeadlineAt: { lte: now },
          },
          select: {
            addressChangeDetail: {
              select: { licenceRecordId: true, locality: true, pincode: true },
            },
            applicantId: true,
            id: true,
          },
        })
        if (!application) continue
        if (!application.addressChangeDetail) {
          throw new Error(
            "Due address-change application is missing its detail record."
          )
        }

        await transaction.documentRecord.updateMany({
          data: { status: "ACCEPTED" },
          where: {
            applicationId: application.id,
            status: "UNDER_REVIEW",
            type: "ADDRESS_PROOF",
          },
        })
        await transaction.workflowEvent.createMany({
          data: [
            {
              actor: "SYSTEM",
              actorId: systemActorId,
              applicationId: application.id,
              description:
                "DigiLicense completed the automatic proof review. No government service was contacted.",
              fromStatus: "DOCUMENT_REVIEW",
              title: "Address proof verified",
              toStatus: "DOCUMENTS_VERIFIED",
            },
            {
              actor: "SYSTEM",
              actorId: systemActorId,
              applicationId: application.id,
              description:
                "The address update is recorded by DigiLicense only; no government service was contacted.",
              fromStatus: "DOCUMENTS_VERIFIED",
              title: "Address change recorded",
              toStatus: "APPROVED",
            },
          ],
        })
        await transaction.application.update({
          where: { id: application.id },
          data: {
            blockingReasonCode: null,
            nextAction:
              "No further action is required. The update is recorded by DigiLicense only; no government service was contacted.",
            status: "APPROVED",
            statusDeadlineAt: null,
            version: { increment: 1 },
          },
        })
        await transaction.drivingLicenceRecord.update({
          where: { id: application.addressChangeDetail.licenceRecordId },
          data: {
            currentAddressSummary: formatLicenceAddressSummary(
              application.addressChangeDetail.locality,
              application.addressChangeDetail.pincode
            ),
          },
        })
        await transaction.notificationRecord.create({
          data: {
            applicantId: application.applicantId,
            applicationId: application.id,
            message:
              "Your address update is recorded by DigiLicense only. No government service was contacted.",
            title: "Address change completed",
          },
        })
        await transaction.auditEvent.create({
          data: {
            action: "AUTO_APPROVE_ADDRESS_CHANGE",
            actorId: systemActorId,
            applicationId: application.id,
            entityId: application.id,
            entityType: "APPLICATION",
            reasonCode: "AUTOMATIC_ADDRESS_PROOF_REVIEW_ACCEPTED",
            requestId: randomUUID(),
          },
        })
      }

      return dueApplications.length
    },
    {
      maxWait: addressReviewTransactionMaxWaitMs,
      timeout: addressReviewTransactionTimeoutMs,
    }
  )
}

async function processDueAddressChangeReviews(): Promise<AddressReviewRunResult> {
  let processedCount = 0

  for (;;) {
    const processedInBatch = await processAddressReviewBatch(new Date())
    processedCount += processedInBatch
    if (processedInBatch < addressReviewBatchSize) return { processedCount }
  }
}

export { processDueAddressChangeReviews }
export type { AddressReviewRunResult }
