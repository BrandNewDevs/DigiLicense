import { describe, expect, it } from "vitest"

import {
  gradeLearnerTestAnswers,
  learnerTestPassMark,
  learnerTestQuestionCount,
} from "./learner-test"

const questionIds = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]

function buildAnswerKey(): Map<string, number> {
  // Deterministic key: question qN's correct option is (N mod 3).
  return new Map(
    questionIds.map((id, index) => [id, (index + 1) % 3])
  )
}

describe("gradeLearnerTestAnswers", () => {
  it("passes when the score meets the pass mark", () => {
    const answerKey = buildAnswerKey()
    const answers = [...questionIds.keys()].map((index) =>
      answerKey.get(questionIds[index]) as number
    )

    const result = gradeLearnerTestAnswers(answerKey, questionIds, answers)

    expect(result).not.toBeNull()
    expect(result?.score).toBe(learnerTestQuestionCount)
    expect(result?.passed).toBe(true)
  })

  it("fails one below the pass mark", () => {
    const answerKey = buildAnswerKey()

    const answers = [...questionIds.keys()].map((index) =>
      answerKey.get(questionIds[index]) as number
    )
    // Wrong answers drop the score to exactly one below the pass mark.
    for (let index = 0; index < learnerTestQuestionCount - learnerTestPassMark + 1; index += 1) {
      answers[index] = (answers[index] + 1) % 3
    }

    const result = gradeLearnerTestAnswers(answerKey, questionIds, answers)

    expect(result?.score).toBe(learnerTestPassMark - 1)
    expect(result?.passed).toBe(false)
  })

  it("rejects submissions with a mismatched answer count", () => {
    const answerKey = buildAnswerKey()

    expect(
      gradeLearnerTestAnswers(answerKey, questionIds, new Array(9).fill(0))
    ).toBeNull()
    expect(
      gradeLearnerTestAnswers(
        answerKey,
        questionIds,
        new Array(learnerTestQuestionCount + 1).fill(0)
      )
    ).toBeNull()
  })

  it("never scores unknown question identifiers", () => {
    const answerKey = buildAnswerKey()

    const result = gradeLearnerTestAnswers(
      answerKey,
      ["q-unknown", ...questionIds.slice(1)],
      new Array(questionIds.length).fill(0)
    )

    expect(result?.passed).toBe(false)
    expect((result?.score ?? 0)).toBeLessThan(learnerTestPassMark)
  })

  it("exposes the pass mark below the question count", () => {
    expect(learnerTestPassMark).toBeLessThan(learnerTestQuestionCount)
  })
})
