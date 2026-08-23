type ServiceField = {
  defaultValue?: string
  label: string
  name: string
  options?: readonly string[]
  placeholder?: string
  type: "date" | "select" | "text"
}

// A service can declare a persisted workflow. Workflow-backed services render
// a guided, server-validated flow instead of the static prototype form.
type ServiceWorkflow = "learner-licence"

type ServiceDefinition = {
  action: string
  description: string
  fields: readonly ServiceField[]
  id: string
  protected: boolean
  summary: string
  title: string
  whatYouNeed: readonly string[]
  workflow?: ServiceWorkflow
}

const services = [
  {
    id: "learner-licence",
    title: "Apply for a learner's licence",
    summary: "Start a first-time driving-licence application.",
    description:
      "Choose a vehicle class and Delhi zone, then review the mock application before submission.",
    action: "Create mock application",
    protected: true,
    whatYouNeed: [
      "Synthetic proof of age and address",
      "A vehicle class",
      "A Delhi test zone",
    ],
    workflow: "learner-licence",
    fields: [
      {
        label: "Vehicle class",
        name: "vehicleClass",
        type: "select",
        options: ["Motorcycle without gear", "Motorcycle with gear", "Car"],
      },
      {
        label: "Preferred Delhi zone",
        name: "zone",
        type: "select",
        options: ["Central Delhi", "East Delhi", "North Delhi", "South Delhi"],
      },
    ],
  },
  {
    id: "learner-test",
    title: "Take the learner's test",
    summary: "Complete a short simulated learner's test.",
    description:
      "Use the demo application to try the test flow. The result has no official effect.",
    action: "Start simulated test",
    protected: true,
    whatYouNeed: [
      "A mock learner application",
      "Ten uninterrupted minutes",
      "No real licence or identity details",
    ],
    fields: [
      {
        label: "Mock application number",
        name: "applicationNumber",
        type: "text",
        defaultValue: "DLDEMO20260001",
      },
      {
        label: "Test language",
        name: "language",
        type: "select",
        options: ["English", "Hindi"],
      },
    ],
  },
  {
    id: "permanent-licence",
    title: "Apply for a permanent licence",
    summary: "Continue after the learner's-licence waiting period.",
    description:
      "Check the mock eligibility date, prepare the application, and continue to an appointment.",
    action: "Check mock eligibility",
    protected: true,
    whatYouNeed: [
      "An eligible mock learner's licence",
      "The same vehicle class",
      "A driving-test appointment",
    ],
    fields: [
      {
        label: "Mock learner's-licence number",
        name: "learnerLicenceNumber",
        type: "text",
        defaultValue: "DL-LL-DEMO-26001",
      },
      {
        label: "Vehicle class",
        name: "vehicleClass",
        type: "select",
        options: ["Motorcycle without gear", "Motorcycle with gear", "Car"],
      },
    ],
  },
  {
    id: "renew-licence",
    title: "Renew a driving licence",
    summary: "Prepare a renewal for a licence nearing expiry.",
    description:
      "Review a synthetic licence record, choose the renewal reason, and see the next step.",
    action: "Prepare mock renewal",
    protected: true,
    whatYouNeed: [
      "A synthetic driving-licence number",
      "A renewal reason",
      "Mock documents if requested",
    ],
    fields: [
      {
        label: "Mock driving-licence number",
        name: "licenceNumber",
        type: "text",
        defaultValue: "DL-DEMO-2020-0042",
      },
      {
        label: "Renewal reason",
        name: "reason",
        type: "select",
        options: ["Expiring soon", "Recently expired"],
      },
    ],
  },
  {
    id: "duplicate-licence",
    title: "Replace a driving licence",
    summary: "Request a duplicate for a lost or damaged licence.",
    description:
      "Tell us why the synthetic licence needs replacement and review the mock fee.",
    action: "Create mock replacement request",
    protected: true,
    whatYouNeed: [
      "A synthetic driving-licence record",
      "The replacement reason",
      "A mock declaration",
    ],
    fields: [
      {
        label: "Mock driving-licence number",
        name: "licenceNumber",
        type: "text",
        defaultValue: "DL-DEMO-2020-0042",
      },
      {
        label: "Replacement reason",
        name: "reason",
        type: "select",
        options: ["Lost", "Damaged", "Details are unreadable"],
      },
    ],
  },
  {
    id: "change-address",
    title: "Change the address on a licence",
    summary: "Prepare an address-change request for Delhi.",
    description:
      "Choose a synthetic Delhi locality and review which mock proof would be required.",
    action: "Prepare mock address change",
    protected: true,
    whatYouNeed: [
      "A synthetic driving-licence record",
      "A Delhi locality",
      "Synthetic address proof",
    ],
    fields: [
      {
        label: "Mock driving-licence number",
        name: "licenceNumber",
        type: "text",
        defaultValue: "DL-DEMO-2020-0042",
      },
      {
        label: "New mock locality",
        name: "locality",
        type: "select",
        options: ["Dwarka", "Lajpat Nagar", "Mayur Vihar", "Rohini"],
      },
    ],
  },
  {
    id: "update-mobile",
    title: "Update a mobile number",
    summary: "Try the mobile-update and simulated verification flow.",
    description:
      "The prototype uses a fixed demo number and never sends an OTP or contacts anyone.",
    action: "Send simulated OTP",
    protected: true,
    whatYouNeed: [
      "The fixed synthetic mobile number",
      "The displayed demo OTP",
      "Optional mock Aadhaar consent",
    ],
    fields: [
      {
        label: "Synthetic mobile number",
        name: "mobileNumber",
        type: "text",
        defaultValue: "9000000001",
      },
      {
        label: "Verification method",
        name: "verificationMethod",
        type: "select",
        options: ["Simulated OTP", "Mock Aadhaar authentication"],
      },
    ],
  },
  {
    id: "track-application",
    title: "Track an application",
    summary: "See the current status and the next required action.",
    description:
      "Look up the seeded demo application. Results are limited to the mock applicant account.",
    action: "Show mock status",
    protected: true,
    whatYouNeed: [
      "The seeded demo applicant",
      "A mock application number",
      "No real application details",
    ],
    fields: [
      {
        label: "Mock application number",
        name: "applicationNumber",
        type: "text",
        defaultValue: "DLDEMO20260001",
      },
    ],
  },
  {
    id: "fees",
    title: "Check licence fees",
    summary: "View the prototype fee schedule without signing in.",
    description:
      "Choose a service to see a simulated fee estimate. Confirm final fees with the relevant authority outside this prototype.",
    action: "Calculate mock fee",
    protected: false,
    whatYouNeed: [
      "The service you plan to use",
      "The vehicle class where relevant",
      "No personal details",
    ],
    fields: [
      {
        label: "Service",
        name: "feeService",
        type: "select",
        options: [
          "Learner's licence",
          "Permanent licence",
          "Renewal",
          "Replacement",
        ],
      },
    ],
  },
  {
    id: "appointments",
    title: "Book a driving-test appointment",
    summary: "Choose a slot or join the transparent waitlist.",
    description:
      "Set a Delhi zone and date preference. If no mock slot is available, the demo can place the applicant on a waitlist.",
    action: "Check mock appointments",
    protected: true,
    whatYouNeed: [
      "An eligible mock application",
      "A preferred Delhi test zone",
      "A date preference",
    ],
    fields: [
      {
        label: "Test zone",
        name: "zone",
        type: "select",
        options: ["Dwarka", "Lado Sarai", "Mayur Vihar", "Rohini"],
      },
      {
        label: "Preferred date",
        name: "preferredDate",
        type: "date",
      },
    ],
  },
] as const satisfies readonly ServiceDefinition[]

type ServiceId = (typeof services)[number]["id"]

function getService(serviceId: string) {
  return services.find((service) => service.id === serviceId)
}

export { getService, services }
export type { ServiceDefinition, ServiceField, ServiceId }
