import { describe, expect, it } from "vitest"

import {
  compareRankedAppointmentCandidates,
  isEligibleForAppointment,
  rankAppointmentCandidate,
} from "./appointment-ranking.ts"

const now = new Date("2026-08-27T10:00:00.000Z")

describe("appointment-v1 ranking", () => {
  it("combines continuous urgency, capped queue age, and preference rank", () => {
    const result = rankAppointmentCandidate(
      {
        id: "entry-a",
        learnerEligibilityDeadlineAt: new Date("2026-09-11T10:00:00.000Z"),
        originalJoinedAt: new Date("2026-08-20T10:00:00.000Z"),
        preferenceRank: 1,
      },
      now
    )

    expect(result).toEqual({
      breakdown: {
        preferencePoints: 10,
        urgencyPoints: 30,
        waitTimePoints: 7,
      },
      policyVersion: "appointment-v1",
      score: 47,
    })
  })

  it("caps urgency and wait-time points while excluding an expired learner eligibility", () => {
    const result = rankAppointmentCandidate(
      {
        id: "entry-a",
        learnerEligibilityDeadlineAt: new Date("2026-08-01T10:00:00.000Z"),
        originalJoinedAt: new Date("2026-06-01T10:00:00.000Z"),
        preferenceRank: 3,
      },
      now
    )

    expect(result.breakdown).toEqual({
      preferencePoints: 2,
      urgencyPoints: 60,
      waitTimePoints: 30,
    })
    expect(isEligibleForAppointment(new Date("2026-08-27T09:59:59.999Z"), now)).toBe(
      false
    )
  })

  it("breaks equal scores by original join time and then stable entry ID", () => {
    const shared = {
      breakdown: { preferencePoints: 10, urgencyPoints: 20, waitTimePoints: 5 },
      learnerEligibilityDeadlineAt: new Date("2026-09-17T10:00:00.000Z"),
      policyVersion: "appointment-v1" as const,
      preferenceRank: 1 as const,
      score: 35,
    }
    const earlier = {
      ...shared,
      id: "entry-z",
      originalJoinedAt: new Date("2026-08-20T10:00:00.000Z"),
    }
    const later = {
      ...shared,
      id: "entry-a",
      originalJoinedAt: new Date("2026-08-21T10:00:00.000Z"),
    }
    const sameTimeLowerId = {
      ...shared,
      id: "entry-a",
      originalJoinedAt: earlier.originalJoinedAt,
    }

    expect(compareRankedAppointmentCandidates(earlier, later)).toBeLessThan(0)
    expect(compareRankedAppointmentCandidates(sameTimeLowerId, earlier)).toBeLessThan(0)
  })
})
