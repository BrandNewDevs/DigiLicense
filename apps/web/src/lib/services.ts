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
type ServiceWorkflow =
  | "address-change"
  | "application-status"
  | "learner-licence"
  | "learner-test"
  | "mobile-update"
  | "permanent-licence"
  | "renewal"
  | "fees"

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
      "Choose a vehicle class and Delhi zone, then review the application before submission.",
    action: "Create application",
    protected: true,
    whatYouNeed: [
      "Proof of age and address",
      "A vehicle class",
      "A Delhi test zone",
    ],
    workflow: "learner-licence",
    fields: [
      {
        label: "Vehicle class",
        name: "vehicleClass",
        type: "select",
        options: [
          "Two-wheeler without gear (MCWOG)",
          "Two-wheeler with gear (MCWG)",
          "Car / Light Motor Vehicle (LMV)",
        ],
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
    summary: "Complete the learner's test for your application.",
    description:
      "Answer road-sign and road-rule questions in English or Hindi. The result decides whether you continue or retake.",
    action: "Start learner's test",
    protected: true,
    whatYouNeed: [
      "A learner's-licence application whose checks are complete",
      "Ten questions and a pass mark of six",
      "No real licence or identity details",
    ],
    workflow: "learner-test",
    fields: [],
  },
  {
    id: "permanent-licence",
    title: "Apply for a permanent licence",
    summary: "Continue after the learner's-licence waiting period.",
    description:
      "Check the eligibility date, prepare the application, and continue to an appointment.",
    action: "Check eligibility",
    protected: true,
    workflow: "permanent-licence",
    whatYouNeed: [
      "An eligible learner's licence",
      "The same vehicle class",
      "A driving-test appointment",
    ],
    fields: [
      {
        label: "Learner's-licence number",
        name: "learnerLicenceNumber",
        type: "text",
        defaultValue: "DL-LL-DEMO-26001",
      },
      {
        label: "Vehicle class",
        name: "vehicleClass",
        type: "select",
        options: [
          "Two-wheeler without gear (MCWOG)",
          "Two-wheeler with gear (MCWG)",
          "Car / Light Motor Vehicle (LMV)",
        ],
      },
    ],
  },
  {
    id: "renew-licence",
    title: "Renew a driving licence",
    summary: "Prepare a renewal for a licence nearing expiry.",
    description:
      "Review a licence record, choose the renewal reason, and see the next step.",
    action: "Prepare renewal",
    protected: true,
    workflow: "renewal",
    whatYouNeed: [
      "A driving-licence record",
      "A renewal reason that matches the expiry date",
      "A recorded fee outcome",
    ],
    fields: [
      {
        label: "Driving-licence number",
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
      "Tell us why the licence needs replacement and review the fee.",
    action: "Create replacement request",
    protected: true,
    whatYouNeed: [
      "A driving-licence record",
      "The replacement reason",
      "A declaration",
    ],
    fields: [
      {
        label: "Driving-licence number",
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
      "Choose a Delhi locality and review which proof would be required.",
    action: "Start address change",
    protected: true,
    workflow: "address-change",
    whatYouNeed: [
      "A driving-licence record",
      "A Delhi locality",
      "Address proof",
    ],
    fields: [
      {
        label: "Driving-licence number",
        name: "licenceNumber",
        type: "text",
        defaultValue: "DL-DEMO-2020-0042",
      },
      {
        label: "New locality",
        name: "locality",
        type: "select",
        options: ["Dwarka", "Lajpat Nagar", "Mayur Vihar", "Rohini"],
      },
    ],
  },
  {
    id: "update-mobile",
    title: "Update a mobile number",
    summary: "Try the mobile-update and verification flow.",
    description:
      "The service uses a fixed number and never sends an OTP or contacts anyone.",
    action: "Send OTP",
    protected: true,
    whatYouNeed: [
      "A synthetic ten-digit mobile number",
      "The synthetic OTP shown for the prototype",
      "Optional mock Aadhaar verification — no Aadhaar number",
    ],
    workflow: "mobile-update",
    fields: [
      {
        label: "Mobile number",
        name: "mobileNumber",
        type: "text",
        defaultValue: "9000000004",
      },
      {
        label: "Verification method",
        name: "verificationMethod",
        type: "select",
        options: ["OTP", "Aadhaar authentication"],
      },
    ],
  },
  {
    id: "track-application",
    title: "Track an application",
    summary: "See the current status and the next required action.",
    description:
      "Look up the seeded application. Results are limited to the applicant account.",
    action: "Show status",
    protected: true,
    workflow: "application-status",
    whatYouNeed: [
      "The seeded applicant",
      "An application number",
      "No real application details",
    ],
    fields: [
      {
        label: "Application number",
        name: "applicationNumber",
        type: "text",
        defaultValue: "DLDEMO20260001",
      },
    ],
  },
  {
    id: "fees",
    title: "Check licence fees",
    summary: "View the fee schedule without signing in.",
    description:
      "Choose a service to see a fee estimate. Confirm final fees with the relevant authority.",
    action: "Calculate fee",
    protected: false,
    workflow: "fees",
    whatYouNeed: ["The service you plan to use", "No personal details"],
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
      "Set a Delhi zone and date preference. If no slot is available, the applicant can join a waitlist.",
    action: "Check appointments",
    protected: true,
    whatYouNeed: [
      "An eligible application",
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
