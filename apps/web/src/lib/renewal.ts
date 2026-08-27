const renewalServiceName = "Driving-licence renewal"
const renewalWindowMonths = 12
const renewalValidityYears = 10

function addUtcMonths(value: Date, months: number): Date {
  const targetMonth = value.getUTCMonth() + months
  const targetYear = value.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0)
  ).getUTCDate()

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(value.getUTCDate(), lastDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  )
}

function addUtcYears(value: Date, years: number): Date {
  return addUtcMonths(value, years * 12)
}

type RenewalEligibility =
  | { closesAt: Date; kind: "eligible"; opensAt: Date }
  | { closesAt: Date; kind: "not-open"; opensAt: Date }
  | { closesAt: Date; kind: "window-closed"; opensAt: Date }

function getRenewalEligibility(
  validUntil: Date,
  now: Date
): RenewalEligibility {
  const opensAt = addUtcMonths(validUntil, -renewalWindowMonths)
  const closesAt = addUtcMonths(validUntil, renewalWindowMonths)
  if (now < opensAt) return { closesAt, kind: "not-open", opensAt }
  if (now > closesAt) return { closesAt, kind: "window-closed", opensAt }
  return { closesAt, kind: "eligible", opensAt }
}

export {
  addUtcYears,
  getRenewalEligibility,
  renewalServiceName,
  renewalValidityYears,
}
export type { RenewalEligibility }
