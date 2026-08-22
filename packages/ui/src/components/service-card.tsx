import { ArrowUpRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"

type ServiceCardProps = {
  children: ReactNode
  description: string
  icon: LucideIcon
  meta: string
  metaId?: string
  title: string
}

function ServiceCard({
  children,
  description,
  icon: Icon,
  meta,
  metaId,
  title,
}: ServiceCardProps) {
  return (
    <article className="group flex h-full min-h-0 flex-col rounded-[1.6rem] border border-border bg-card p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:transform-none sm:p-7">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted">
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="mt-8">
        <h3 className="max-w-[280px] font-heading text-2xl font-medium tracking-[-0.05em]">
          {title}
        </h3>
        <p className="mt-3 max-w-[300px] text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="mt-auto border-t border-border pt-5">
        <p
          className="mb-4 flex min-h-6 items-center text-sm font-medium text-muted-foreground"
          id={metaId}
        >
          {meta}
        </p>
        <div className="flex min-h-[132px] flex-col justify-end">
          {children}
        </div>
      </div>
    </article>
  )
}

type ServiceCardActionProps = {
  href: string
  label: string
}

function ServiceCardAction({ href, label }: ServiceCardActionProps) {
  return (
    <a
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
      href={href}
    >
      {label}
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </a>
  )
}

type ServiceLookupFormProps = {
  describedBy?: string
  feedback?: ReactNode
  fieldId: string
  fieldLabel: string
  fieldName: string
  isSubmitting?: boolean
  placeholder: string
  submitLabel: string
  onSubmit: (value: string) => Promise<void> | void
}

function ServiceLookupForm({
  describedBy,
  feedback,
  fieldId,
  fieldLabel,
  fieldName,
  isSubmitting = false,
  placeholder,
  submitLabel,
  onSubmit,
}: ServiceLookupFormProps) {
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        const value = String(formData.get(fieldName) ?? "").trim()

        if (value) await onSubmit(value)
      }}
    >
      <label className="mb-2 block text-sm font-medium" htmlFor={fieldId}>
        {fieldLabel}
      </label>
      <input
        id={fieldId}
        name={fieldName}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={placeholder}
        inputMode="text"
        autoComplete="off"
        required
        aria-describedby={describedBy}
      />
      <Button className="h-11 w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Checking..." : submitLabel}
      </Button>
      {feedback}
    </form>
  )
}

export { ServiceCard, ServiceCardAction, ServiceLookupForm }
export type { ServiceCardActionProps, ServiceCardProps, ServiceLookupFormProps }
