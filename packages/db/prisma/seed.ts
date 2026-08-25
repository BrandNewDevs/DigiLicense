import { fileURLToPath } from "node:url"

import { config } from "dotenv"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import {
  ApplicationStatus,
  WorkflowActor,
} from "../src/generated/prisma/enums.ts"
import { createDatabaseAdapter } from "../src/database-adapter.ts"

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
    nextAction: "Wait for the mock document review.",
    title: "Synthetic application submitted",
  },
  {
    applicantId: "demo-applicant-003",
    applicationNumber: "DLDEMO20260002",
    service: "Learner's licence",
    status: ApplicationStatus.TEST_PENDING,
    nextAction: "Wait for the simulated learner-test result.",
    title: "Simulated test completed",
  },
  {
    applicantId: "demo-applicant-002",
    applicationNumber: "DLDEMO20260003",
    service: "Permanent driving licence",
    status: ApplicationStatus.PAYMENT_REVIEW,
    nextAction: "Wait for the simulated payment check.",
    title: "Mock payment needs review",
  },
  {
    applicantId: "demo-applicant-001",
    applicationNumber: "DLDEMO20260004",
    service: "Driving-licence renewal",
    status: ApplicationStatus.APPROVAL_PENDING,
    nextAction: "Wait for the mock operator decision.",
    title: "Synthetic checks completed",
  },
  {
    applicantId: "demo-applicant-001",
    applicationNumber: "DLDEMO20260005",
    service: "Permanent driving licence",
    status: ApplicationStatus.WAITLISTED,
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
