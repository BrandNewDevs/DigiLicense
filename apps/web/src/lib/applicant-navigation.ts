// Shared applicant-facing navigation so every route renders identical entries
// and cannot drift.
type ApplicantNavigationEntry = {
  href: string
  label: string
}

const applicantNavigation = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
] as const satisfies readonly ApplicantNavigationEntry[]

export { applicantNavigation }
export type { ApplicantNavigationEntry }
