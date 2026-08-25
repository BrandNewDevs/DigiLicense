import { z } from "zod"

import {
  learnerTestLanguageValues,
  learnerTestQuestionCount,
} from "../lib/learner-test"

// The enum is built from the shared literal values so the parsed output is
// exactly the client-safe LearnerTestLanguage union.
const learnerTestLanguageSchema = z.enum(learnerTestLanguageValues)

// strictObject rejects unexpected fields outright instead of silently
// stripping them, so malformed payloads never reach workflow logic.
const learnerTestStartSchema = z.strictObject({
  language: learnerTestLanguageSchema,
})

// Each answer is the index of the option the applicant selected. Options are
// bounded by the question bank (three options), so index 3 can never match
// any server-side answer key and must be rejected at the boundary rather
// than graded as a wrong answer. The count is fixed server-side; short or
// long submissions are rejected outright.
const learnerTestSubmissionSchema = z.strictObject({
  language: learnerTestLanguageSchema,
  answers: z.array(z.number().int().min(0).max(2)).length(learnerTestQuestionCount),
  // Client-generated key so a retried submission after a lost response
  // returns the stored graded result instead of recording a second attempt.
  idempotencyKey: z.uuid(),
})

export {
  learnerTestLanguageSchema,
  learnerTestStartSchema,
  learnerTestSubmissionSchema,
}
