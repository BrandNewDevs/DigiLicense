import { createServerFn } from "@tanstack/react-start"

import {
  applicationPaymentReadSchema,
  feeQuoteSchema,
  resolveApplicationPaymentSchema,
  startApplicationPaymentSchema,
} from "../validation/payment"

const getFeeQuote = createServerFn({ method: "POST" })
  .validator((input: unknown) => feeQuoteSchema.parse(input))
  .handler(async ({ data }) => {
    const { getFeeQuote: readFeeQuote } =
      await import("../server/payment.server")
    return readFeeQuote(data)
  })

const readApplicationPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => applicationPaymentReadSchema.parse(input))
  .handler(async ({ data }) => {
    const { readApplicationPayment: readPayment } =
      await import("../server/payment.server")
    return readPayment(data)
  })

const startApplicationPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => startApplicationPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const { startApplicationPayment: startPayment } =
      await import("../server/payment.server")
    return startPayment(data)
  })

const resolveApplicationPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => resolveApplicationPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolveApplicationPayment: resolvePayment } =
      await import("../server/payment.server")
    return resolvePayment(data)
  })

export {
  getFeeQuote,
  readApplicationPayment,
  resolveApplicationPayment,
  startApplicationPayment,
}
