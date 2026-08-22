import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"

import { getActionsForStatus } from "../lib/operator-workflow"
import type { OperatorAction } from "../lib/operator-workflow"
import { runOperatorApplicationAction } from "../server-functions/operator"

type OperatorActionPanelProps = {
  applicationId: string
  status: string
  version: number
}

function OperatorActionPanel({
  applicationId,
  status,
  version,
}: OperatorActionPanelProps) {
  const actions = getActionsForStatus(status)
  const runAction = useServerFn(runOperatorApplicationAction)
  const router = useRouter()
  const [selectedAction, setSelectedAction] = useState<OperatorAction>()
  const [message, setMessage] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (actions.length === 0) {
    return (
      <section
        className="border-t border-border pt-7"
        aria-labelledby="actions-title"
      >
        <h2 className="font-heading text-xl font-medium" id="actions-title">
          Operator actions
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          This seeded scenario has no operator action at its current mock state.
        </p>
      </section>
    )
  }

  return (
    <section
      className="border-t border-border pt-7"
      aria-labelledby="actions-title"
    >
      <h2 className="font-heading text-xl font-medium" id="actions-title">
        Operator actions
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Select an action, explain the decision, and confirm that it affects
        synthetic data only.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            aria-pressed={selectedAction === action.id}
            key={action.id}
            onClick={() => {
              setSelectedAction(action.id)
              setMessage(undefined)
            }}
            type="button"
            variant={selectedAction === action.id ? "default" : "outline"}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {selectedAction ? (
        <form
          className="mt-6 rounded-xl bg-muted p-4 sm:p-5"
          onSubmit={async (event) => {
            event.preventDefault()
            const formData = new FormData(event.currentTarget)
            setIsSubmitting(true)
            setMessage(undefined)

            try {
              const result = await runAction({
                data: {
                  applicationId,
                  action: selectedAction,
                  expectedVersion: version,
                  justification: String(formData.get("justification") ?? ""),
                },
              })

              if (result.kind === "updated") {
                setMessage("The synthetic application was updated.")
                await router.invalidate()
                return
              }

              setMessage(
                result.kind === "conflict" || result.kind === "rate-limited"
                  ? result.message
                  : "The action could not be completed. Sign in again or reload the case."
              )
            } catch {
              setMessage(
                "The mock action is unavailable. No record was changed."
              )
            } finally {
              setIsSubmitting(false)
            }
          }}
        >
          <label className="block text-sm font-medium" htmlFor="justification">
            Decision note
          </label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
            id="justification"
            maxLength={300}
            minLength={10}
            name="justification"
            placeholder="Explain this simulated decision"
            required
          />
          <label className="mt-4 flex items-start gap-3 text-sm leading-6">
            <input
              className="mt-1 size-4"
              name="confirmed"
              required
              type="checkbox"
            />
            <span>
              I understand this changes synthetic DigiLicense data only.
            </span>
          </label>
          <Button className="mt-5" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Applying action..." : "Confirm mock action"}
          </Button>
        </form>
      ) : null}

      {message ? (
        <p className="mt-4 text-sm" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}

export { OperatorActionPanel }
