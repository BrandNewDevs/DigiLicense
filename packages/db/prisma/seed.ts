import { fileURLToPath } from "node:url"

import { config } from "dotenv"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import {
  ApplicationBlockingReason,
  ApplicationStatus,
  AppointmentNotificationChannel,
  AppointmentSlotStatus,
  AppointmentWaitlistStatus,
  FeeService,
  WorkflowActor,
} from "../src/generated/prisma/enums.ts"
import { createDatabaseAdapter } from "../src/database-adapter.ts"
import {
  getCurrentMobileHmacKeyVersion,
  hashMobileNumber,
} from "../src/mobile-identity.ts"

config({
  path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)),
})

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the synthetic demo data.")
}

const prisma = new PrismaClient({
  adapter: createDatabaseAdapter(databaseUrl),
})

const feeCatalogueVersion = "digilicense-2026-v1"
const feeCatalogueEffectiveFrom = new Date("2026-01-01T00:00:00.000Z")
const feeSchedules = [
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

await prisma.$transaction(async (transaction) => {
  // Integration and local environments can already contain a different
  // active catalogue version. Retain those rows as fee history while making
  // the resettable seed catalogue the sole active version for each service.
  await transaction.feeSchedule.updateMany({
    where: {
      active: true,
      service: { in: feeSchedules.map((fee) => fee.service) },
    },
    data: { active: false },
  })

  for (const fee of feeSchedules) {
    await transaction.feeSchedule.upsert({
      where: {
        code_version: { code: fee.code, version: feeCatalogueVersion },
      },
      update: {
        active: true,
        amountPaise: fee.amountPaise,
        effectiveFrom: feeCatalogueEffectiveFrom,
        service: fee.service,
      },
      create: {
        ...fee,
        active: true,
        effectiveFrom: feeCatalogueEffectiveFrom,
        version: feeCatalogueVersion,
      },
    })
  }
})

const applicantAccounts = [
  { id: "demo-applicant-001", mobileNumber: "9000000001" },
  { id: "demo-applicant-002", mobileNumber: "9000000002" },
  { id: "demo-applicant-003", mobileNumber: "9000000003" },
  { id: "demo-applicant-004", mobileNumber: "9000000004" },
] as const

for (const applicant of applicantAccounts) {
  await prisma.applicantAccount.upsert({
    where: { id: applicant.id },
    update: {
      mobileHmac: hashMobileNumber(applicant.mobileNumber),
      mobileHmacKeyVersion: getCurrentMobileHmacKeyVersion(),
      mobileLastFour: applicant.mobileNumber.slice(-4),
    },
    create: {
      id: applicant.id,
      mobileHmac: hashMobileNumber(applicant.mobileNumber),
      mobileHmacKeyVersion: getCurrentMobileHmacKeyVersion(),
      mobileLastFour: applicant.mobileNumber.slice(-4),
    },
  })
}

// This separate account is resettable appointment-fixture data. Its learner
// test is already past the 30-day waiting period so the permanent-to-offer
// journey can be shown without weakening the production eligibility rule.
const appointmentFixtureApplicantId = "demo-applicant-004"
const appointmentFixtureNow = new Date()
const appointmentFixturePassedAt = new Date(
  appointmentFixtureNow.getTime() - 31 * 24 * 60 * 60 * 1_000
)
const appointmentFixtureEligibilityDeadline = new Date(
  appointmentFixturePassedAt.getTime() + 180 * 24 * 60 * 60 * 1_000
)

const appointmentFixtureLearner = await prisma.application.upsert({
  where: { applicationNumber: "DLDEMO20260006" },
  update: {},
  create: {
    applicantId: appointmentFixtureApplicantId,
    applicationNumber: "DLDEMO20260006",
    nextAction: "Your learner test result is recorded by DigiLicense only.",
    service: "Learner's licence",
    status: ApplicationStatus.TEST_PASSED,
    submittedAt: appointmentFixturePassedAt,
    updatedAt: appointmentFixturePassedAt,
    workflowEvents: {
      create: {
        actor: WorkflowActor.SYSTEM,
        actorId: "synthetic-seed",
        description:
          "Created as synthetic DigiLicense data. No government service was contacted.",
        title: "Learner test passed",
        toStatus: ApplicationStatus.TEST_PASSED,
      },
    },
  },
  select: { id: true },
})

await prisma.applicationDraft.upsert({
  where: { applicationId: appointmentFixtureLearner.id },
  update: {},
  create: {
    applicantId: appointmentFixtureApplicantId,
    applicationId: appointmentFixtureLearner.id,
    formPayload: JSON.stringify({ vehicleClass: "LIGHT_MOTOR_VEHICLE" }),
    service: "Learner's licence",
  },
})

const appointmentFixturePermanent = await prisma.application.upsert({
  where: { applicationNumber: "DLDEMO20260007" },
  update: {},
  create: {
    applicantId: appointmentFixtureApplicantId,
    applicationNumber: "DLDEMO20260007",
    blockingReasonCode: ApplicationBlockingReason.APPOINTMENT_SLOT_UNAVAILABLE,
    nextAction: "Wait for an appointment offer from DigiLicense.",
    service: "Permanent driving licence",
    status: ApplicationStatus.WAITLISTED,
    workflowEvents: {
      create: {
        actor: WorkflowActor.SYSTEM,
        actorId: "synthetic-seed",
        description:
          "Created as synthetic DigiLicense appointment fixture data. No government service was contacted.",
        title: "Joined appointment waitlist",
        toStatus: ApplicationStatus.WAITLISTED,
      },
    },
  },
  select: { id: true },
})

await prisma.permanentLicenceDetail.upsert({
  where: {
    applicantId_idempotencyKey: {
      applicantId: appointmentFixtureApplicantId,
      idempotencyKey: "seeded-appointment-permanent-application",
    },
  },
  update: {},
  create: {
    applicantId: appointmentFixtureApplicantId,
    applicationId: appointmentFixturePermanent.id,
    idempotencyKey: "seeded-appointment-permanent-application",
    learnerApplicationId: appointmentFixtureLearner.id,
    learnerEligibilityDeadlineAt: appointmentFixtureEligibilityDeadline,
    vehicleClass: "LIGHT_MOTOR_VEHICLE",
  },
})

const appointmentFixtureEntry = await prisma.appointmentWaitlistEntry.upsert({
  where: { joinIdempotencyKey: "seeded-appointment-waitlist-entry" },
  update: {},
  create: {
    applicantId: appointmentFixtureApplicantId,
    applicationId: appointmentFixturePermanent.id,
    joinIdempotencyKey: "seeded-appointment-waitlist-entry",
    originalJoinedAt: new Date(
      appointmentFixtureNow.getTime() - 4 * 24 * 60 * 60 * 1_000
    ),
    status: AppointmentWaitlistStatus.ACTIVE,
  },
  select: { id: true },
})

await prisma.appointmentPreference.deleteMany({
  where: { waitlistEntryId: appointmentFixtureEntry.id },
})
await prisma.appointmentPreference.createMany({
  data: [
    {
      rank: 1,
      waitlistEntryId: appointmentFixtureEntry.id,
      zone: "CENTRAL_DELHI",
    },
    {
      rank: 2,
      waitlistEntryId: appointmentFixtureEntry.id,
      zone: "EAST_DELHI",
    },
    {
      rank: 3,
      waitlistEntryId: appointmentFixtureEntry.id,
      zone: "SOUTH_DELHI",
    },
  ],
})
await prisma.appointmentNotificationPreference.deleteMany({
  where: { waitlistEntryId: appointmentFixtureEntry.id },
})
await prisma.appointmentNotificationPreference.createMany({
  data: [
    {
      channel: AppointmentNotificationChannel.SMS,
      recipientAlias: "synthetic-sms:demo-applicant-004",
      waitlistEntryId: appointmentFixtureEntry.id,
    },
    {
      channel: AppointmentNotificationChannel.EMAIL,
      recipientAlias: "synthetic-email:demo-applicant-004",
      waitlistEntryId: appointmentFixtureEntry.id,
    },
  ],
})

const appointmentFixtureSlots = [
  {
    endsAt: new Date(appointmentFixtureNow.getTime() + 26 * 60 * 60 * 1_000),
    inventoryKey: "seeded-appointment-central-lmv-001",
    startsAt: new Date(appointmentFixtureNow.getTime() + 25 * 60 * 60 * 1_000),
    vehicleClass: "LIGHT_MOTOR_VEHICLE",
    zone: "CENTRAL_DELHI",
  },
  {
    endsAt: new Date(appointmentFixtureNow.getTime() + 50 * 60 * 60 * 1_000),
    inventoryKey: "seeded-appointment-east-lmv-001",
    startsAt: new Date(appointmentFixtureNow.getTime() + 49 * 60 * 60 * 1_000),
    vehicleClass: "LIGHT_MOTOR_VEHICLE",
    zone: "EAST_DELHI",
  },
] as const

for (const slot of appointmentFixtureSlots) {
  await prisma.appointmentSlot.upsert({
    where: { inventoryKey: slot.inventoryKey },
    update: {},
    create: { ...slot, status: AppointmentSlotStatus.OPEN },
  })
}

const drivingLicenceRecords = [
  {
    applicantId: "demo-applicant-001",
    currentAddressSummary: "Synthetic Dwarka address",
    licenceNumber: "DL-DEMO-2020-0042",
  },
  {
    applicantId: "demo-applicant-002",
    currentAddressSummary: "Synthetic Mayur Vihar address",
    licenceNumber: "DL-DEMO-2021-0043",
  },
  {
    applicantId: "demo-applicant-003",
    currentAddressSummary: "Synthetic Rohini address",
    licenceNumber: "DL-DEMO-2022-0044",
  },
] as const

for (const licence of drivingLicenceRecords) {
  await prisma.drivingLicenceRecord.upsert({
    where: { licenceNumber: licence.licenceNumber },
    update: {
      applicantId: licence.applicantId,
      currentAddressSummary: licence.currentAddressSummary,
    },
    create: licence,
  })
}

// Scenarios are spread across synthetic applicants because the database
// allows only one active application per (applicant, service) pair. The
// primary demo applicant (001) keeps a clean learner's-licence slate so the
// guided submission flow can be demonstrated live; 002 and 003 hold the
// remaining in-flight cases so the operator dashboard stays varied.
const scenarios = [
  {
    applicantId: "demo-applicant-002",
    applicationNumber: "DLDEMO20260001",
    service: "Learner's licence",
    status: ApplicationStatus.DOCUMENT_REVIEW,
    blockingReasonCode: ApplicationBlockingReason.DOCUMENT_REVIEW_PENDING,
    nextAction: "Wait for the mock document review.",
    title: "Synthetic application submitted",
  },
  {
    applicantId: "demo-applicant-003",
    applicationNumber: "DLDEMO20260002",
    service: "Learner's licence",
    status: ApplicationStatus.TEST_PENDING,
    blockingReasonCode: ApplicationBlockingReason.TEST_RESULT_PENDING,
    nextAction: "Wait for the simulated learner-test result.",
    title: "Simulated test completed",
  },
  {
    applicantId: "demo-applicant-002",
    applicationNumber: "DLDEMO20260003",
    service: "Permanent driving licence",
    status: ApplicationStatus.PAYMENT_REVIEW,
    blockingReasonCode: ApplicationBlockingReason.PAYMENT_CONFIRMATION_PENDING,
    nextAction: "Wait for the simulated payment check.",
    title: "Mock payment needs review",
  },
  {
    applicantId: "demo-applicant-001",
    applicationNumber: "DLDEMO20260004",
    service: "Driving-licence renewal",
    status: ApplicationStatus.APPROVAL_PENDING,
    blockingReasonCode: ApplicationBlockingReason.APPROVAL_REVIEW_PENDING,
    nextAction: "Wait for the mock operator decision.",
    title: "Synthetic checks completed",
  },
  {
    applicantId: "demo-applicant-001",
    applicationNumber: "DLDEMO20260005",
    service: "Permanent driving licence",
    status: ApplicationStatus.WAITLISTED,
    blockingReasonCode: ApplicationBlockingReason.APPOINTMENT_SLOT_UNAVAILABLE,
    nextAction: "Wait for a synthetic driving-test slot offer.",
    title: "Joined the mock appointment waitlist",
  },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isKnownActiveApplicationConflict(error: unknown): boolean {
  // A previous demo run can leave an application whose (applicantId, service)
  // pair collides with the partial unique guard named in
  // 20260824120000_add_one_active_application_guard even though the seeded
  // application number differs. Re-seeding must skip such rows instead of
  // failing, because the live workflow data wins over synthetic seed data.
  //
  // Prisma 7 PostgreSQL adapters report this P2002 in several shapes: the
  // constraint name under meta.index or meta.target, or only the involved
  // field names in the message. All three forms are recognized.
  if (!error || typeof error !== "object") return false
  if (!("code" in error) || error.code !== "P2002") return false

  const constraintName = "application_active_applicant_service_key"

  if ("meta" in error) {
    const meta: unknown = error.meta
    if (isRecord(meta)) {
      for (const key of ["index", "target"] as const) {
        const value: unknown = meta[key]
        const text = Array.isArray(value)
          ? value.join(",")
          : typeof value === "string"
            ? value
            : ""
        if (text.toLowerCase().includes(constraintName)) {
          return true
        }
        if (/applicantid/i.test(text) && /service/i.test(text)) {
          return true
        }
      }
    }
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : ""

  return (
    message.includes(constraintName) ||
    (message.includes("applicantid") && message.includes("service"))
  )
}

for (const scenario of scenarios) {
  try {
    await prisma.application.upsert({
      where: { applicationNumber: scenario.applicationNumber },
      update: {},
      create: {
        applicantId: scenario.applicantId,
        applicationNumber: scenario.applicationNumber,
        service: scenario.service,
        status: scenario.status,
        nextAction: scenario.nextAction,
        blockingReasonCode: scenario.blockingReasonCode,
        workflowEvents: {
          create: {
            actor: WorkflowActor.SYSTEM,
            actorId: "synthetic-seed",
            title: scenario.title,
            description:
              "Created as synthetic DigiLicense data. No government service was contacted.",
            toStatus: scenario.status,
          },
        },
      },
    })
  } catch (error) {
    if (isKnownActiveApplicationConflict(error)) {
      console.log(
        `Skipped seeding ${scenario.applicationNumber}: this applicant already holds an active application from a demo run.`
      )
      continue
    }

    // Unexpected failures propagate: seed.ts exits non-zero and setup fails.
    throw error
  }
}

await prisma.$disconnect()
