// Canonical definitions for the learner's-licence workflow. Both the Zod
// validation schemas and the applicant UI import from here so option values,
// labels, and eligibility rules can never drift apart.

const learnerServiceName = "Learner's licence"

type VehicleClassOption = {
  minimumAgeYears: number
  value: (typeof vehicleClassValues)[number]
  label: string
}

const vehicleClassValues = [
  "MOTORCYCLE_WITHOUT_GEAR",
  "MOTORCYCLE_WITH_GEAR",
  "LIGHT_MOTOR_VEHICLE",
] as const

// Minimum ages follow public learner's-licence rules: 16 for a gearless
// motorcycle and 18 for geared motorcycles and cars.
const vehicleClasses = [
  {
    label: "Motorcycle without gear",
    minimumAgeYears: 16,
    value: "MOTORCYCLE_WITHOUT_GEAR",
  },
  {
    label: "Motorcycle with gear",
    minimumAgeYears: 18,
    value: "MOTORCYCLE_WITH_GEAR",
  },
  {
    label: "Car",
    minimumAgeYears: 18,
    value: "LIGHT_MOTOR_VEHICLE",
  },
] as const satisfies readonly VehicleClassOption[]

type DelhiZoneOption = {
  value: (typeof delhiZoneValues)[number]
  label: string
}

const delhiZoneValues = [
  "CENTRAL_DELHI",
  "EAST_DELHI",
  "NORTH_DELHI",
  "SOUTH_DELHI",
] as const

const delhiZones = [
  { label: "Central Delhi", value: "CENTRAL_DELHI" },
  { label: "East Delhi", value: "EAST_DELHI" },
  { label: "North Delhi", value: "NORTH_DELHI" },
  { label: "South Delhi", value: "SOUTH_DELHI" },
] as const satisfies readonly DelhiZoneOption[]

type ProofOption = {
  value: (typeof addressProofValues)[number]
  label: string
}

const identityProofValues = [
  "MOCK_AADHAAR_CARD",
  "MOCK_VOTER_ID",
  "MOCK_PASSPORT",
] as const

const identityProofOptions = [
  { label: "Aadhaar card", value: "MOCK_AADHAAR_CARD" },
  { label: "Voter ID card", value: "MOCK_VOTER_ID" },
  { label: "Passport", value: "MOCK_PASSPORT" },
] as const satisfies readonly ProofOption[]

// Written out explicitly so Zod receives a stable tuple of literals.
const addressProofValues = [
  "MOCK_AADHAAR_CARD",
  "MOCK_VOTER_ID",
  "MOCK_PASSPORT",
  "MOCK_UTILITY_BILL",
] as const

const addressProofOptions = [
  ...identityProofOptions,
  {
    label: "Recent utility bill",
    value: "MOCK_UTILITY_BILL",
  },
] as const satisfies readonly ProofOption[]

// The youngest age any learner's-licence class accepts. Used to reject an
// impossible date of birth immediately on the personal-details step, before a
// vehicle class has even been chosen.
const minimumLearnerAgeYears = Math.min(
  ...vehicleClasses.map((option) => option.minimumAgeYears)
)

function getVehicleClass(value: string): VehicleClassOption | undefined {
  return vehicleClasses.find((option) => option.value === value)
}

// Parses an ISO calendar date as UTC and reports whether it names a real
// calendar day, rejecting shapes such as 2006-02-30 or 2006-13-01.
function isValidIsoCalendarDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false

  const [year, month, day] = isoDate.split("-").map(Number)

  const utcTimestamp = Date.UTC(year, month - 1, day)
  const roundTrip = new Date(utcTimestamp)

  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  )
}

// Counts completed years between the birth date and the reference date, both
// read in UTC, so the result never depends on the server time zone.
function calculateCompletedYears(
  isoDate: string,
  referenceDate: Date
): number | undefined {
  if (!isValidIsoCalendarDate(isoDate)) return undefined

  const [birthYear, birthMonth, birthDay] = isoDate.split("-").map(Number)

  let completedYears = referenceDate.getUTCFullYear() - birthYear

  const hasBirthdayPassedThisYear =
    referenceDate.getUTCMonth() + 1 > birthMonth ||
    (referenceDate.getUTCMonth() + 1 === birthMonth &&
      referenceDate.getUTCDate() >= birthDay)

  if (!hasBirthdayPassedThisYear) completedYears -= 1

  return completedYears
}

export {
  addressProofOptions,
  addressProofValues,
  calculateCompletedYears,
  delhiZones,
  delhiZoneValues,
  getVehicleClass,
  identityProofOptions,
  identityProofValues,
  isValidIsoCalendarDate,
  learnerServiceName,
  minimumLearnerAgeYears,
  vehicleClasses,
  vehicleClassValues,
}
export type { DelhiZoneOption, ProofOption, VehicleClassOption }
