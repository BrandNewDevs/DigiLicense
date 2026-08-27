import "@tanstack/react-start/server-only"

import type { Prisma } from "@digilicense/db/server"

const terminalStatuses = ["APPROVED", "REJECTED"] as const

async function hasConflictingLicenceWorkflow(
  transaction: Prisma.TransactionClient,
  input: {
    applicantId: string
    excludedService: string
    licenceRecordId: string
  }
): Promise<boolean> {
  const conflict = await transaction.application.findFirst({
    where: {
      applicantId: input.applicantId,
      service: { not: input.excludedService },
      status: { notIn: [...terminalStatuses] },
      OR: [
        {
          addressChangeDetail: {
            is: { licenceRecordId: input.licenceRecordId },
          },
        },
        {
          renewalDetail: { is: { licenceRecordId: input.licenceRecordId } },
        },
        {
          replacementDetail: {
            is: { licenceRecordId: input.licenceRecordId },
          },
        },
      ],
    },
    select: { id: true },
  })
  return conflict !== null
}

export { hasConflictingLicenceWorkflow }
