// Client-safe learner's-test definitions. Correct answers never live here;
// the server-side bank in src/server/learner-test-bank.server.ts owns them
// and the browser only ever receives sanitized questions.

type TestQuestionOption = {
  en: string
  hi: string
}

type PublicTestQuestion = {
  id: string
  category: "road-sign" | "rule"
  prompt: {
    en: string
    hi: string
  }
  options: readonly TestQuestionOption[]
}

type LearnerTestLanguage = "ENGLISH" | "HINDI"

// The official learner's test requires a fixed number of correct answers out
// of the question set. Six of ten keeps the flow realistic but quick.
const learnerTestQuestionCount = 10
const learnerTestPassMark = 6

const learnerTestLanguageValues = ["ENGLISH", "HINDI"] as const

const learnerTestLanguages = [
  { label: "English", value: "ENGLISH" },
  { label: "हिन्दी", value: "HINDI" },
] as const satisfies readonly { label: string; value: LearnerTestLanguage }[]

function gradeLearnerTestAnswers(
  answerKey: ReadonlyMap<string, number>,
  questionIds: readonly string[],
  submittedAnswers: readonly number[]
): { score: number; passed: boolean } | null {
  if (submittedAnswers.length !== questionIds.length) return null

  let score = 0

  for (const [index, questionId] of questionIds.entries()) {
    const correctOptionIndex = answerKey.get(questionId)

    // An unknown question identifier fails the attempt rather than throwing,
    // so a stale or tampered payload can never score points.
    if (correctOptionIndex === undefined) continue

    if (submittedAnswers[index] === correctOptionIndex) score += 1
  }

  return { score, passed: score >= learnerTestPassMark }
}

export {
  gradeLearnerTestAnswers,
  learnerTestLanguages,
  learnerTestLanguageValues,
  learnerTestPassMark,
  learnerTestQuestionCount,
}
export type { LearnerTestLanguage, PublicTestQuestion, TestQuestionOption }
