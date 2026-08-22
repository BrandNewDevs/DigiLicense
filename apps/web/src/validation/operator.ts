import { z } from "zod"

import { operatorActions } from "../lib/operator-workflow"

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
    expectedVersion: z.number().int().positive(),
    justification: z.string().trim().min(10).max(300),
  })
  .strict()

export { operatorApplicationActionSchema, operatorApplicationSchema }
