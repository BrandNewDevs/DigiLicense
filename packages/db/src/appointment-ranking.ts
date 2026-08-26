const appointmentRankingPolicyVersion = "appointment-v1" as const
const dayMilliseconds = 24 * 60 * 60 * 1_000
const urgencyWindowDays = 30
const maximumUrgencyPoints = 60
const maximumWaitTimePoints = 30

type AppointmentPreferenceRank = 1 | 2 | 3

type AppointmentRankingCandidate = {
  id: string
  learnerEligibilityDeadlineAt: Date
  originalJoinedAt: Date
  preferenceRank: AppointmentPreferenceRank
}

type AppointmentRankingBreakdown = {
  preferencePoints: number
  urgencyPoints: number
  waitTimePoints: number
}

type AppointmentRankingResult = {
  breakdown: AppointmentRankingBreakdown
  policyVersion: typeof appointmentRankingPolicyVersion
  score: number
}

type RankedAppointmentCandidate = AppointmentRankingCandidate &
  AppointmentRankingResult

function preferencePoints(preferenceRank: AppointmentPreferenceRank): number {
  switch (preferenceRank) {
    case 1:
      return 10
    case 2:
      return 6
    case 3:
      return 2
  }
}

function urgencyPoints(learnerEligibilityDeadlineAt: Date, now: Date): number {
  const remainingMilliseconds =
    learnerEligibilityDeadlineAt.getTime() - now.getTime()
  const urgencyWindowMilliseconds = urgencyWindowDays * dayMilliseconds

  if (remainingMilliseconds <= 0) return maximumUrgencyPoints
  if (remainingMilliseconds >= urgencyWindowMilliseconds) return 0

  return Math.min(
    maximumUrgencyPoints,
    Math.ceil(
      ((urgencyWindowMilliseconds - remainingMilliseconds) /
        urgencyWindowMilliseconds) *
        maximumUrgencyPoints
    )
  )
}

function waitTimePoints(originalJoinedAt: Date, now: Date): number {
  const completedDays = Math.floor(
    Math.max(0, now.getTime() - originalJoinedAt.getTime()) / dayMilliseconds
  )

  return Math.min(maximumWaitTimePoints, completedDays)
}

function rankAppointmentCandidate(
  candidate: AppointmentRankingCandidate,
  now: Date
): AppointmentRankingResult {
  const breakdown = {
    preferencePoints: preferencePoints(candidate.preferenceRank),
    urgencyPoints: urgencyPoints(candidate.learnerEligibilityDeadlineAt, now),
    waitTimePoints: waitTimePoints(candidate.originalJoinedAt, now),
  }

  return {
    breakdown,
    policyVersion: appointmentRankingPolicyVersion,
    score:
      breakdown.urgencyPoints +
      breakdown.waitTimePoints +
      breakdown.preferencePoints,
  }
}

function compareRankedAppointmentCandidates(
  left: RankedAppointmentCandidate,
  right: RankedAppointmentCandidate
): number {
  if (left.score !== right.score) return right.score - left.score

  const joinTimeDifference =
    left.originalJoinedAt.getTime() - right.originalJoinedAt.getTime()
  if (joinTimeDifference !== 0) return joinTimeDifference

  return left.id.localeCompare(right.id)
}

function isEligibleForAppointment(
  learnerEligibilityDeadlineAt: Date,
  now: Date
): boolean {
  return learnerEligibilityDeadlineAt.getTime() > now.getTime()
}

export {
  appointmentRankingPolicyVersion,
  compareRankedAppointmentCandidates,
  isEligibleForAppointment,
  rankAppointmentCandidate,
}
export type {
  AppointmentPreferenceRank,
  AppointmentRankingBreakdown,
  AppointmentRankingCandidate,
  AppointmentRankingResult,
  RankedAppointmentCandidate,
}
