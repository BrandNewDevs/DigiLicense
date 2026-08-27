import { useForm } from "@tanstack/react-form"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import type { ServiceDefinition } from "../lib/services"

type ServicePrototypeFormProps = {
  service: ServiceDefinition
}

function ServicePrototypeForm({ service }: ServicePrototypeFormProps) {
  const [submitted, setSubmitted] = useState(false)
  const form = useForm({
    defaultValues: Object.fromEntries(
      service.fields.map((field) => [field.name, field.defaultValue ?? ""])
    ),
    onSubmit: () => setSubmitted(true),
  })

  if (submitted) {
    return (
      <section
        className="rounded-xl border border-border p-6 sm:p-8"
        aria-live="polite"
      >
        <h2 className="font-sans text-2xl font-medium">
          Your request is ready
        </h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Nothing was sent or saved. This confirms the route and its basic form
          flow work without contacting a government service.
        </p>
        <Button
          className="mt-6 h-11 px-5 text-base"
          variant="outline"
          onClick={() => {
            form.reset()
            setSubmitted(false)
          }}
          type="button"
        >
          Start again
        </Button>
      </section>
    )
  }

  return (
    <form
      className="rounded-xl border border-border p-6 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h2 className="font-sans text-2xl font-medium">Enter details</h2>
      <p className="mt-3 leading-7 text-muted-foreground">
        Do not enter a real licence number, mobile number, address, or identity
        detail.
      </p>

      <div className="mt-7 space-y-5">
        {service.fields.map((field) => (
          <form.Field key={field.name} name={field.name}>
            {(formField) => (
              <div>
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
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    required
                    value={formField.state.value}
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
                    id={field.name}
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    placeholder={field.placeholder}
                    required
                    type={field.type}
                    value={formField.state.value}
                  />
                )}
              </div>
            )}
          </form.Field>
        ))}
      </div>

      <Button className="mt-7 h-11 w-full text-base" type="submit">
        {service.action}
      </Button>
    </form>
  )
}

export { ServicePrototypeForm }
