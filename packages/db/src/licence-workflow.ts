const learnerLicenceServiceName = "Learner's licence"
const permanentLicenceServiceName = "Permanent driving licence"
const permanentLicenceWaitingPeriodDays = 30
const learnerLicenceValidityDays = 180

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export {
  addUtcDays,
  learnerLicenceServiceName,
  learnerLicenceValidityDays,
  permanentLicenceServiceName,
  permanentLicenceWaitingPeriodDays,
}
