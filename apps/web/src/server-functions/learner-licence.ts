import { createServerFn } from "@tanstack/react-start"

import {
  learnerLicenceDraftPayloadSchema,
  learnerLicenceSubmissionSchema,
} from "../validation/learner-licence"

const readLearnerLicenceState = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readLearnerLicenceState: readState } = await import(
      "../server/learner-licence.server"
    )

    return readState()
  }
)

const saveLearnerLicenceDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    learnerLicenceDraftPayloadSchema.parse(input)
  )
  .handler(async ({ data }) => {
    const { saveLearnerLicenceDraft: saveDraft } = await import(
      "../server/learner-licence.server"
    )

    return saveDraft({ payload: data })
  })

const submitLearnerLicenceApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => learnerLicenceSubmissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { submitLearnerLicenceApplication: submitApplication } =
      await import("../server/learner-licence.server")

    return submitApplication(data)
  })

export {
  readLearnerLicenceState,
  saveLearnerLicenceDraft,
  submitLearnerLicenceApplication,
}
