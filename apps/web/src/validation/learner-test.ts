import { z } from "zod"

import {
  learnerTestLanguageValues,
  learnerTestQuestionCount,
} from "../lib/learner-test"

// The enum is built from the shared literal values so the parsed output is
// exactly the client-safe LearnerTestLanguage union.
const learnerTestLanguageSchema = z.enum(learnerTestLanguageValues)

// Each answer is the index of the option the applicant selected. The count is
// fixed server-side; short or long submissions are rejected outright.
const learnerTestSubmissionSchema = z.object({
  language: learnerTestLanguageSchema,
  answers: z.array(z.number().int().min(0).max(3)).length(learnerTestQuestionCount),
})

const learnerTestStartSchema = z.object({
  language: learnerTestLanguageSchema,
})

export {
  learnerTestLanguageSchema,
  learnerTestStartSchema,
  learnerTestSubmissionSchema,
}
