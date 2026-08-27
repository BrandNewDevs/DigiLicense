import type { AskAssistantInput } from "../validation/assistant"

type AssistantLocale = AskAssistantInput["locale"]

function formatAssistantRetryMessage(
  locale: AssistantLocale,
  retryAfterSeconds: number
): string {
  return locale === "hi"
    ? `लगभग ${retryAfterSeconds} सेकंड बाद फिर से प्रयास करें।`
    : `Try again in about ${retryAfterSeconds} seconds.`
}

export { formatAssistantRetryMessage }
