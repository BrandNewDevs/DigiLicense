import { z } from "zod"

import {
  getDecisionReasonCodes,
  operatorActions,
} from "../lib/operator-workflow"
import type { OperatorAction } from "../lib/operator-workflow"

const operatorActionNames = Object.keys(operatorActions) as [
  keyof typeof operatorActions,
  ...(keyof typeof operatorActions)[],
]

const operatorApplicationSchema = z.object({
  applicationId: z.string().min(8).max(40),
})

const operatorApplicationActionSchema = operatorApplicationSchema
  .extend({
    action: z.enum(operatorActionNames),
    decisionReasonCode: z.string().trim().min(4).max(60),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const allowedCodes = getDecisionReasonCodes(data.action)

    if (!allowedCodes.includes(data.decisionReasonCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decisionReasonCode"],
        message:
          "The decision reason must come from the allowlist for this action.",
      })
    }
  })

export { operatorApplicationActionSchema, operatorApplicationSchema }
export type { OperatorAction }
