import { describe, expect, it } from "vitest"

import {
  learnerTestStartSchema,
  learnerTestSubmissionSchema,
} from "./learner-test"

const validKey = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

const validAnswers = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0]

describe("learnerTestSubmissionSchema", () => {
  it("accepts a well-formed submission", () => {
    const result = learnerTestSubmissionSchema.safeParse({
      language: "ENGLISH",
      answers: validAnswers,
      idempotencyKey: validKey,
    })

    expect(result.success).toBe(true)
  })

  it("rejects an option index outside the question bank", () => {
    // Three options exist per question; index 3 can never match any answer
    // key and must be rejected at the boundary instead of graded as wrong.
    const result = learnerTestSubmissionSchema.safeParse({
      language: "ENGLISH",
      answers: [0, 1, 2, 3, 1, 2, 0, 1, 2, 0],
      idempotencyKey: validKey,
    })

    expect(result.success).toBe(false)
  })

  it("rejects submissions with the wrong answer count", () => {
    const result = learnerTestSubmissionSchema.safeParse({
      language: "HINDI",
      answers: validAnswers.slice(0, 9),
      idempotencyKey: validKey,
    })

    expect(result.success).toBe(false)
  })

  it("rejects unexpected fields instead of stripping them", () => {
    const result = learnerTestSubmissionSchema.safeParse({
      language: "ENGLISH",
      answers: validAnswers,
      idempotencyKey: validKey,
      applicationNumber: "DLDEMO20260001",
    })

    expect(result.success).toBe(false)
  })

  it("rejects a non-UUID idempotency key", () => {
    const result = learnerTestSubmissionSchema.safeParse({
      language: "ENGLISH",
      answers: validAnswers,
      idempotencyKey: "not-a-uuid",
    })

    expect(result.success).toBe(false)
  })
})

describe("learnerTestStartSchema", () => {
  it("rejects unexpected fields", () => {
    const result = learnerTestStartSchema.safeParse({
      language: "ENGLISH",
      applicationNumber: "DLDEMO20260001",
    })

    expect(result.success).toBe(false)
  })
})
