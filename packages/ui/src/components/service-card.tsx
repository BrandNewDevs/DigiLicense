import { ArrowRight } from "lucide-react"
import type { ElementType, ReactNode } from "react"

type ServiceCardProps = {
  children: ReactNode
  description: string
  meta: string
  title: string
}

function ServiceCard({ children, description, meta, title }: ServiceCardProps) {
  return (
    <article className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h3 className="max-w-[280px] font-heading text-2xl font-medium tracking-[-0.05em] sm:min-h-16">
          {title}
        </h3>
        <p className="mt-3 max-w-[300px] text-sm leading-6 text-muted-foreground sm:min-h-18">
          {description}
        </p>
      </div>

      <div className="mt-6">{children}</div>

      <div className="mt-auto pt-6">
        <p className="text-sm leading-6 text-muted-foreground">{meta}</p>
      </div>
    </article>
  )
}

type ServiceCardActionProps = {
  href: string
  label: string
  linkComponent?: ElementType
}

function ServiceCardAction({
  href,
  label,
  linkComponent,
}: ServiceCardActionProps) {
  const LinkElement = linkComponent ?? "a"

  return (
    <LinkElement
      className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none sm:w-auto"
      {...(linkComponent ? { to: href } : { href })}
    >
      {label}
      <ArrowRight
        className="size-4 -rotate-45 transition-transform group-hover:rotate-0 group-focus-visible:rotate-0 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </LinkElement>
  )
}

export { ServiceCard, ServiceCardAction }
export type { ServiceCardActionProps, ServiceCardProps }
