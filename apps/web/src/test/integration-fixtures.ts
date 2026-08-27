import {
  FeeService,
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
  await prisma.appointmentNotificationDelivery.deleteMany()
  await prisma.confirmedAppointment.deleteMany()
  await prisma.appointmentOffer.deleteMany()
  await prisma.appointmentNotificationPreference.deleteMany()
  await prisma.appointmentPreference.deleteMany()
  await prisma.appointmentWaitlistEntry.deleteMany()
  await prisma.appointmentSlot.deleteMany()
  await prisma.learnerTestAttempt.deleteMany()
  await prisma.addressChangeDetail.deleteMany()
  await prisma.documentRecord.deleteMany()
  await prisma.paymentRecord.deleteMany()
  await prisma.feeSchedule.deleteMany()
  await prisma.notificationRecord.deleteMany()
  await prisma.workflowEvent.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.applicationDraft.deleteMany()
  await prisma.permanentLicenceDetail.deleteMany()
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

async function seedIntegrationFeeSchedules(): Promise<void> {
  const effectiveFrom = new Date("2026-01-01T00:00:00.000Z")
  const version = "integration-v1"
  const schedules = [
    {
      amountPaise: 15_000,
      code: "DL-FEE-LEARNER",
      service: FeeService.LEARNER_LICENCE,
    },
    {
      amountPaise: 20_000,
      code: "DL-FEE-PERMANENT",
      service: FeeService.PERMANENT_LICENCE,
    },
    {
      amountPaise: 5_000,
      code: "DL-FEE-ADDRESS",
      service: FeeService.ADDRESS_CHANGE,
    },
    {
      amountPaise: 20_000,
      code: "DL-FEE-RENEWAL",
      service: FeeService.RENEWAL,
    },
    {
      amountPaise: 25_000,
      code: "DL-FEE-REPLACEMENT",
      service: FeeService.REPLACEMENT,
    },
  ] as const

  await prisma.feeSchedule.createMany({
    data: schedules.map((schedule) => ({
      ...schedule,
      effectiveFrom,
      version,
    })),
  })
}

async function resetAndSeedIntegrationDatabase(): Promise<void> {
  await resetIntegrationDatabase()
  await seedIntegrationFeeSchedules()
  await seedIntegrationApplicants()
}

export {
  getIntegrationApplicantId,
  integrationApplicants,
  resetAndSeedIntegrationDatabase,
  resetIntegrationDatabase,
}
export type { IntegrationApplicantKey }
