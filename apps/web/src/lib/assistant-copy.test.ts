import { describe, expect, it } from "vitest"

import { formatAssistantRetryMessage } from "./assistant-copy"

describe("assistant retry copy", () => {
  it("formats the retry delay in English", () => {
    expect(formatAssistantRetryMessage("en", 60)).toBe(
      "Try again in about 60 seconds."
    )
  })

  it("formats the retry delay in Hindi", () => {
    expect(formatAssistantRetryMessage("hi", 60)).toBe(
      "लगभग 60 सेकंड बाद फिर से प्रयास करें।"
    )
  })
})
