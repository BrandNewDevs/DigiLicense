import {
  getCurrentMobileHmacKeyVersion,
  hashMobileNumber,
  prisma,
} from "@digilicense/db/server"

const integrationApplicants = {
  a: {
    id: "integration-applicant-a",
    licenceNumber: "DL-INT-A-0001",
    mobileNumber: "9100000001",
  },
  b: {
    id: "integration-applicant-b",
    licenceNumber: "DL-INT-B-0001",
    mobileNumber: "9100000002",
  },
} as const

type IntegrationApplicantKey = keyof typeof integrationApplicants

function getIntegrationApplicantId(key: IntegrationApplicantKey): string {
  return integrationApplicants[key].id
}

async function resetIntegrationDatabase(): Promise<void> {
  // This intentionally uses a fixed allowlist of Prisma models. The setup
  // module rejects every database except the ephemeral integration database
  // before any test imports this fixture.
  await prisma.learnerTestAttempt.deleteMany()
  await prisma.addressChangeDetail.deleteMany()
  await prisma.documentRecord.deleteMany()
  await prisma.paymentRecord.deleteMany()
  await prisma.notificationRecord.deleteMany()
  await prisma.workflowEvent.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.applicationDraft.deleteMany()
  await prisma.application.deleteMany()
  await prisma.mobileChangeRequest.deleteMany()
  await prisma.addressChangeVerification.deleteMany()
  await prisma.drivingLicenceRecord.deleteMany()
  await prisma.applicantAccount.deleteMany()
  await prisma.rateLimitWindow.deleteMany()
}

async function seedIntegrationApplicants(): Promise<void> {
  const keyVersion = getCurrentMobileHmacKeyVersion()

  for (const applicant of Object.values(integrationApplicants)) {
    await prisma.applicantAccount.create({
      data: {
        id: applicant.id,
        mobileHmac: hashMobileNumber(applicant.mobileNumber),
        mobileHmacKeyVersion: keyVersion,
        mobileLastFour: applicant.mobileNumber.slice(-4),
        drivingLicenceRecords: {
          create: {
            licenceNumber: applicant.licenceNumber,
            currentAddressSummary: "Synthetic Delhi address",
          },
        },
      },
    })
  }
}

async function resetAndSeedIntegrationDatabase(): Promise<void> {
  await resetIntegrationDatabase()
  await seedIntegrationApplicants()
}

export {
  getIntegrationApplicantId,
  integrationApplicants,
  resetAndSeedIntegrationDatabase,
  resetIntegrationDatabase,
}
export type { IntegrationApplicantKey }
