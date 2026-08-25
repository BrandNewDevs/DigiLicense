import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import type { ApplicationStatus, TestLanguage } from "@digilicense/db/server"
import { prisma, WorkflowActor } from "@digilicense/db/server"

import {
  gradeLearnerTestAnswers,
  learnerTestPassMark,
  learnerTestQuestionCount,
} from "../lib/learner-test"
import type { LearnerTestLanguage, PublicTestQuestion } from "../lib/learner-test"
import { requireApplicant } from "./demo-session.server"
import { getLearnerTestAnswerKey, learnerTestBank } from "./learner-test-bank.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

// The learner's test opens once automatic document checks are complete. A
// failed attempt keeps the application in the retest-eligible state instead
// of ending the workflow.
const TEST_ELIGIBLE_STATUSES: ApplicationStatus[] = [
  "DOCUMENTS_VERIFIED",
  "TEST_FAILED",
]

type TestAttemptSummary = {
  score: number
  passed: boolean
  createdAt: string
}

type LearnerTestQuestionView = PublicTestQuestion & { optionCount: number }

type LearnerTestReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "no-application"; message: string }
  | { kind: "already-passed"; message: string; applicationNumber: string }
  | {
      kind: "ready"
      applicationNumber: string
      status: ApplicationStatus
      questionCount: number
      passMark: number
      previousAttempts: TestAttemptSummary[]
      questions: LearnerTestQuestionView[]
    }

type LearnerTestSubmitResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "no-application"; message: string }
  | { kind: "already-passed"; message: string; applicationNumber: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | {
      kind: "graded"
      applicationNumber: string
      score: number
      passMark: number
      passed: boolean
    }

function toTestLanguage(language: LearnerTestLanguage): TestLanguage {
  return language === "HINDI" ? "HINDI" : "ENGLISH"
}

function sanitizeQuestions(): LearnerTestQuestionView[] {
  // Correct answers never cross this boundary. Option count lets the client
  // render fixed radio groups without learning which option is correct.
  return learnerTestBank.map((question) => ({
    category: question.category,
    id: question.id,
    optionCount: question.options.length,
    options: question.options.map(({ en, hi }) => ({ en, hi })),
    prompt: question.prompt,
  }))
}

function findTestEligibleApplication(applicantId: string) {
  return prisma.application.findFirst({
    where: {
      applicantId,
      status: { in: TEST_ELIGIBLE_STATUSES },
    },
    orderBy: { submittedAt: "desc" },
    select: { id: true, applicationNumber: true, status: true },
  })
}

async function readLearnerTestState(): Promise<LearnerTestReadResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to take the learner's test.",
    }
  }

  let passedApplication, eligibleApplication, attempts

  try {
    ;[passedApplication, eligibleApplication, attempts] = await Promise.all([
      prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          status: "TEST_PASSED",
        },
        orderBy: { submittedAt: "desc" },
        select: { applicationNumber: true },
      }),
      findTestEligibleApplication(applicant.applicantId),
      prisma.learnerTestAttempt.findMany({
        where: { application: { applicantId: applicant.applicantId } },
        orderBy: { createdAt: "desc" },
        select: { score: true, passed: true, createdAt: true },
        take: 5,
      }),
    ])
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "learner_test_state_read",
    })

    return {
      kind: "unavailable",
      message:
        "The learner's-test service is temporarily unavailable. Try again shortly.",
    }
  }

  if (!eligibleApplication) {
    if (passedApplication) {
      return {
        kind: "already-passed",
        applicationNumber: passedApplication.applicationNumber,
        message:
          "The learner's test was already passed for this account. Continue with the permanent-licence application.",
      }
    }

    return {
      kind: "no-application",
      message:
        "No learner's-licence application is ready for the test yet. Submit the learner's-licence application first.",
    }
  }

  return {
    kind: "ready",
    applicationNumber: eligibleApplication.applicationNumber,
    status: eligibleApplication.status,
    questionCount: learnerTestQuestionCount,
    passMark: learnerTestPassMark,
    previousAttempts: attempts.map((attempt) => ({
      score: attempt.score,
      passed: attempt.passed,
      createdAt: attempt.createdAt.toISOString(),
    })),
    questions: sanitizeQuestions(),
  }
}

async function startLearnerTestAttempt(): Promise<LearnerTestReadResult> {
  return readLearnerTestState()
}

async function submitLearnerTest(input: {
  language: LearnerTestLanguage
  answers: number[]
  idempotencyKey: string
}): Promise<LearnerTestSubmitResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to submit the learner's test.",
    }
  }

  let testLimit

  try {
    testLimit = await consumeRateLimit("learner-test", applicant.applicantId)
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_learner_test_submit",
    })

    return {
      kind: "unavailable",
      message:
        "Test submissions are temporarily unavailable. Try again in a few minutes.",
    }
  }

  if (!testLimit.allowed) {
    return {
      kind: "rate-limited",
      message:
        "Too many test submissions in a short time. Wait a few minutes and try again.",
      retryAfterSeconds: testLimit.retryAfterSeconds,
    }
  }

  const answerKey = getLearnerTestAnswerKey()
  const outcome = gradeLearnerTestAnswers(
    answerKey,
    learnerTestBank.map((question) => question.id),
    input.answers
  )

  // The validator enforces the exact answer count; this repeat check keeps
  // grading rules next to the records they protect.
  if (!outcome) {
    return {
      kind: "unavailable",
      message: "The submitted answers were incomplete. Start the test again.",
    }
  }

  const { passed, score } = outcome
  const language = toTestLanguage(input.language)

  try {
    const result = await prisma.$transaction(async (transaction) => {
      // Serializing test submissions per applicant prevents a failed and a
      // passing submission racing each other into conflicting statuses.
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${applicant.applicantId}, 0))
      `

      // A retried submission whose first request already committed returns
      // the stored graded result without recording anything new.
      const replay = await transaction.learnerTestAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          score: true,
          passed: true,
          application: { select: { applicationNumber: true } },
        },
      })

      if (replay) {
        const graded: {
          replayed: true
          score: number
          passed: boolean
          applicationNumber: string
        } = {
          replayed: true,
          score: replay.score,
          passed: replay.passed,
          applicationNumber: replay.application.applicationNumber,
        }

        return graded
      }

      const application = await transaction.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          status: { in: TEST_ELIGIBLE_STATUSES },
        },
        orderBy: { submittedAt: "desc" },
        select: { id: true, applicationNumber: true, status: true },
      })

      if (!application) {
        return "no-application" as const
      }

      await transaction.learnerTestAttempt.create({
        data: {
          applicationId: application.id,
          idempotencyKey: input.idempotencyKey,
          language,
          questionIds: JSON.stringify(
            learnerTestBank.map((question) => question.id)
          ),
          answers: JSON.stringify(input.answers),
          score,
          passed,
        },
      })

      await transaction.workflowEvent.create({
        data: {
          applicationId: application.id,
          actor: WorkflowActor.APPLICANT,
          actorId: applicant.applicantId,
          title: passed ? "Learner's test passed" : "Learner's test not passed",
          description: `Scored ${score} of ${learnerTestQuestionCount}. The result was recorded on DigiLicense only; no government service was contacted.`,
          fromStatus: application.status,
          toStatus: passed ? "TEST_PASSED" : "TEST_FAILED",
        },
      })

      await transaction.application.update({
        where: { id: application.id },
        data: {
          status: passed ? "TEST_PASSED" : "TEST_FAILED",
          nextAction: passed
            ? "Continue to the permanent-licence application after the waiting period."
            : "You can retake the learner's test. Review the road-sign and road-rule topics first.",
        },
        select: { id: true },
      })

      await transaction.notificationRecord.create({
        data: {
          applicantId: applicant.applicantId,
          applicationId: application.id,
          title: passed
            ? "Learner's test result: passed"
            : "Learner's test result: not passed",
          message: passed
            ? `You scored ${score} of ${learnerTestQuestionCount}. The next step is shown on your application. No government service was contacted.`
            : `You scored ${score} of ${learnerTestQuestionCount}; the pass mark is ${learnerTestPassMark}. You can retake the test. No government service was contacted.`,
        },
      })

      await transaction.auditEvent.create({
        data: {
          applicationId: application.id,
          actorId: applicant.applicantId,
          action: passed
            ? "PASS_LEARNER_TEST"
            : "FAIL_LEARNER_TEST",
          entityType: "LEARNER_TEST_ATTEMPT",
          entityId: application.applicationNumber,
          reasonCode: "SYNTHETIC_TEST_SUBMISSION",
          requestId: randomUUID(),
        },
      })

      return {
        applicationNumber: application.applicationNumber,
      } as const
    })

    if (result === "no-application") {
      return {
        kind: "no-application",
        message:
          "No learner's-licence application is ready for the test. Submit the learner's-licence application first.",
      }
    }

    if ("replayed" in result) {
      // Replay surfaces the stored outcome; nothing new was recorded.
      return {
        kind: "graded",
        applicationNumber: result.applicationNumber,
        score: result.score,
        passMark: learnerTestPassMark,
        passed: result.passed,
      }
    }

    return {
      kind: "graded",
      applicationNumber: result.applicationNumber,
      score,
      passMark: learnerTestPassMark,
      passed,
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "learner_test_submit_transaction",
    })

    return {
      kind: "unavailable",
      message:
        "The test result could not be recorded. Nothing was sent to a government service. Try again shortly.",
    }
  }
}

export {
  readLearnerTestState,
  startLearnerTestAttempt,
  submitLearnerTest,
}
export type {
  LearnerTestReadResult,
  LearnerTestSubmitResult,
}
