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

const scenarios = [
  {
    applicationNumber: "DLDEMO20260001",
    service: "Learner's licence",
    status: ApplicationStatus.DOCUMENT_REVIEW,
    nextAction: "Wait for the mock document review.",
    title: "Synthetic application submitted",
  },
  {
    applicationNumber: "DLDEMO20260002",
    service: "Learner's licence",
    status: ApplicationStatus.TEST_PENDING,
    nextAction: "Wait for the simulated learner-test result.",
    title: "Simulated test completed",
  },
  {
    applicationNumber: "DLDEMO20260003",
    service: "Permanent driving licence",
    status: ApplicationStatus.PAYMENT_REVIEW,
    nextAction: "Wait for the simulated payment check.",
    title: "Mock payment needs review",
  },
  {
    applicationNumber: "DLDEMO20260004",
    service: "Driving-licence renewal",
    status: ApplicationStatus.APPROVAL_PENDING,
    nextAction: "Wait for the mock operator decision.",
    title: "Synthetic checks completed",
  },
  {
    applicationNumber: "DLDEMO20260005",
    service: "Permanent driving licence",
    status: ApplicationStatus.WAITLISTED,
    nextAction: "Wait for a synthetic driving-test slot offer.",
    title: "Joined the mock appointment waitlist",
  },
] as const

for (const scenario of scenarios) {
  await prisma.application.upsert({
    where: { applicationNumber: scenario.applicationNumber },
    update: {},
    create: {
      applicantId: "demo-applicant-001",
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
}

await prisma.$disconnect()
