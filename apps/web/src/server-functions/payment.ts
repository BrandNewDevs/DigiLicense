import { createServerFn } from "@tanstack/react-start"

import {
  applicationPaymentReadSchema,
  feeQuoteSchema,
  resolveApplicationPaymentSchema,
  startApplicationPaymentSchema,
} from "../validation/payment"
import { withServerDeadline } from "./request-deadline"

const getFeeQuote = createServerFn({ method: "POST" })
  .validator((input: unknown) => feeQuoteSchema.parse(input))
  .handler(async ({ data }) => {
    const { getFeeQuote: readFeeQuote } =
      await import("../server/payment.server")
    return withServerDeadline((signal) => {
      signal.throwIfAborted()
      return readFeeQuote(data, signal)
    })
  })

const readApplicationPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => applicationPaymentReadSchema.parse(input))
  .handler(async ({ data }) => {
    const { readApplicationPayment: readPayment } =
      await import("../server/payment.server")
    return withServerDeadline((signal) => {
      signal.throwIfAborted()
      return readPayment(data, signal)
    })
  })

const startApplicationPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => startApplicationPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const { startApplicationPayment: startPayment } =
      await import("../server/payment.server")
    return withServerDeadline((signal) => {
      signal.throwIfAborted()
      return startPayment(data, signal)
    })
  })

const resolveApplicationPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => resolveApplicationPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolveApplicationPayment: resolvePayment } =
      await import("../server/payment.server")
    return withServerDeadline((signal) => {
      signal.throwIfAborted()
      return resolvePayment(data, signal)
    })
  })

export {
  getFeeQuote,
  readApplicationPayment,
  resolveApplicationPayment,
  startApplicationPayment,
}
