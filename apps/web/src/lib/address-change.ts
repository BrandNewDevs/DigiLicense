const addressChangeServiceName = "Driving-licence address change"

const addressChangeLocalityValues = [
  "DWARKA",
  "LAJPAT_NAGAR",
  "MAYUR_VIHAR",
  "ROHINI",
] as const

const mockAddressProofValues = [
  "MOCK_AADHAAR_ADDRESS_PROOF",
  "MOCK_RENTAL_AGREEMENT",
  "MOCK_UTILITY_BILL",
] as const

const mockAddressProofLabels: Record<
  (typeof mockAddressProofValues)[number],
  string
> = {
  MOCK_AADHAAR_ADDRESS_PROOF: "Mock Aadhaar address proof",
  MOCK_RENTAL_AGREEMENT: "Mock rental agreement",
  MOCK_UTILITY_BILL: "Mock utility bill",
}

export {
  addressChangeLocalityValues,
  addressChangeServiceName,
  mockAddressProofLabels,
  mockAddressProofValues,
}
