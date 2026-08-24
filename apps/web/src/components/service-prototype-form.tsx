import { CheckCircle2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import type { ServiceDefinition } from "../lib/services"

type ServicePrototypeFormProps = {
  service: ServiceDefinition
}

function ServicePrototypeForm({ service }: ServicePrototypeFormProps) {
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <section
        className="rounded-3xl border border-border p-6 sm:p-8"
        aria-live="polite"
      >
        <CheckCircle2 className="size-8" aria-hidden="true" />
        <p className="mt-5 text-sm font-medium text-muted-foreground">
          Simulation complete
        </p>
        <h2 className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]">
          Your mock request is ready
        </h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Nothing was sent or saved. This confirms the route and its basic form
          flow work without contacting a government service.
        </p>
        <Button
          className="mt-6 h-11 px-5 text-base"
          variant="outline"
          onClick={() => setSubmitted(false)}
          type="button"
        >
          Start again
        </Button>
      </section>
    )
  }

  return (
    <form
      className="rounded-3xl border border-border p-6 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
      }}
    >
      <p className="text-sm font-medium text-muted-foreground">Simple demo</p>
      <h2 className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]">
        Enter synthetic details
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">
        Do not enter a real licence number, mobile number, address, or identity
        detail.
      </p>

      <div className="mt-7 space-y-5">
        {service.fields.map((field) => (
          <div key={field.name}>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor={field.name}
            >
              {field.label}
            </label>
            {field.type === "select" ? (
              <select
                className="h-11 w-full rounded-lg border border-input px-3 text-base"
                id={field.name}
                name={field.name}
                required
              >
                <option value="">Select an option</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="h-11 w-full rounded-lg border border-input px-3 text-base"
                defaultValue={field.defaultValue}
                id={field.name}
                name={field.name}
                placeholder={field.placeholder}
                type={field.type}
                required
              />
            )}
          </div>
        ))}
      </div>

      <Button className="mt-7 h-11 w-full text-base" type="submit">
        {service.action}
      </Button>
    </form>
  )
}

export { ServicePrototypeForm }
