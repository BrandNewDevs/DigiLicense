import type { ReactNode } from "react"

type SiteFooterProps = {
  children: ReactNode
  title: ReactNode
}

function SiteFooter({ children, title }: SiteFooterProps) {
  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-[1240px] px-5 py-8 text-base leading-7 text-muted-foreground sm:px-8 lg:px-10">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-3 max-w-3xl">{children}</div>
      </div>
    </footer>
  )
}

export { SiteFooter }
export type { SiteFooterProps }
