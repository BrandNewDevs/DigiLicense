// Shared applicant-facing navigation so every route renders identical
// entries and cannot drift. The hash targets exist as sections on the home
// page.
type ApplicantNavigationEntry = {
  href: string
  label: string
}

const applicantNavigation = [
  { href: "/#about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
] as const satisfies readonly ApplicantNavigationEntry[]

export { applicantNavigation }
export type { ApplicantNavigationEntry }
