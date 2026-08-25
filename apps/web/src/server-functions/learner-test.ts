import { createServerFn } from "@tanstack/react-start"

import {
  learnerTestStartSchema,
  learnerTestSubmissionSchema,
} from "../validation/learner-test"

const readLearnerTestState = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readLearnerTestState: readState } = await import(
      "../server/learner-test.server"
    )

    return readState()
  }
)

const startLearnerTestAttempt = createServerFn({ method: "POST" })
  .validator((input: unknown) => learnerTestStartSchema.parse(input))
  .handler(async () => {
    const { startLearnerTestAttempt: startAttempt } = await import(
      "../server/learner-test.server"
    )

    return startAttempt()
  })

const submitLearnerTest = createServerFn({ method: "POST" })
  .validator((input: unknown) => learnerTestSubmissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { submitLearnerTest: submitTest } = await import(
      "../server/learner-test.server"
    )

    return submitTest(data)
  })

export {
  readLearnerTestState,
  startLearnerTestAttempt,
  submitLearnerTest,
}
