import type { ReactNode } from "react"

type SiteFooterProps = {
  children: ReactNode
  contentClassName?: string
  title: ReactNode
}

function SiteFooter({ children, contentClassName, title }: SiteFooterProps) {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-[1240px] px-5 py-6 text-sm leading-6 text-muted-foreground sm:px-8 lg:px-10">
        <p className="font-medium text-foreground">{title}</p>
        <div className={`mt-2 ${contentClassName ?? "max-w-3xl"}`}>
          {children}
        </div>
      </div>
    </footer>
  )
}

export { SiteFooter }
export type { SiteFooterProps }
