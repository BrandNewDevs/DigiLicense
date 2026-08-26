import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getIntegrationApplicantId,
  integrationApplicants,
  resetAndSeedIntegrationDatabase,
} from "../test/integration-fixtures"

let authenticatedApplicant: string | null = null

vi.mock("./demo-session.server", () => ({
  requireApplicant: vi.fn(async () =>
    authenticatedApplicant
      ? { applicantId: authenticatedApplicant, authVersion: 1 }
      : null
  ),
}))

const validLearnerSubmission = {
  addressProofType: "MOCK_UTILITY_BILL" as const,
  dateOfBirth: "2000-06-15",
  declarationAccepted: true as const,
  fullName: "Asha Devi",
  identityProofType: "MOCK_AADHAAR_CARD" as const,
  vehicleClass: "MOTORCYCLE_WITH_GEAR" as const,
  zone: "CENTRAL_DELHI" as const,
}

describe.sequential("PostgreSQL learner workflow boundaries", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("persists an owned learner application with all workflow records", async () => {
    const { submitLearnerLicenceApplication } = await import(
      "./learner-licence.server"
    )
    const { prisma } = await import("@digilicense/db/server")

    const result = await submitLearnerLicenceApplication(validLearnerSubmission)

    expect(result.kind).toBe("submitted")
    if (result.kind !== "submitted") return

    const application = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: result.applicationNumber },
      include: {
        auditEvents: true,
        documents: true,
        notifications: true,
        workflowEvents: true,
      },
    })

    expect(application.applicantId).toBe(getIntegrationApplicantId("a"))
    expect(application.documents).toHaveLength(3)
    expect(application.workflowEvents).toHaveLength(2)
    expect(application.notifications).toHaveLength(1)
    expect(application.auditEvents).toHaveLength(1)
  })

  it("enforces the active-application guard when submits race", async () => {
    const { submitLearnerLicenceApplication } = await import(
      "./learner-licence.server"
    )
    const { prisma } = await import("@digilicense/db/server")

    const outcomes = await Promise.all([
      submitLearnerLicenceApplication(validLearnerSubmission),
      submitLearnerLicenceApplication(validLearnerSubmission),
    ])

    expect(outcomes.filter((outcome) => outcome.kind === "submitted")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.kind === "duplicate-active")).toHaveLength(1)
    await expect(
      prisma.application.count({
        where: {
          applicantId: getIntegrationApplicantId("a"),
          service: "Learner's licence",
        },
      })
    ).resolves.toBe(1)
  })

  it("does not disclose another applicant's status projection", async () => {
    const { submitLearnerLicenceApplication } = await import(
      "./learner-licence.server"
    )
    const { lookupAuthorizedApplicationStatus } = await import(
      "./application-status.server"
    )

    authenticatedApplicant = getIntegrationApplicantId("a")
    const result = await submitLearnerLicenceApplication(validLearnerSubmission)
    expect(result.kind).toBe("submitted")
    if (result.kind !== "submitted") return

    authenticatedApplicant = integrationApplicants.b.id
    await expect(
      lookupAuthorizedApplicationStatus(result.applicationNumber)
    ).resolves.toMatchObject({ kind: "not-found" })
  })
})
