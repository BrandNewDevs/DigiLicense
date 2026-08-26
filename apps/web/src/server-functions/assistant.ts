import { createServerFn } from "@tanstack/react-start"

import { askAssistantSchema } from "../validation/assistant"

const askAssistant = createServerFn({ method: "POST" })
  .validator((input: unknown) => askAssistantSchema.parse(input))
  .handler(async ({ data }) => {
    const { askAssistant: ask } = await import("../server/assistant.server")
    return ask(data)
  })

export { askAssistant }
