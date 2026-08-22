import { useEffect, useState } from "react"

type MockRole = "applicant" | "operator"

type MockSession = {
  expiresAt: number
  issuedAt: number
  role: MockRole
  subjectId: string
  version: 1
}

const mockSessionDurationMs = 30 * 60 * 1000

const mockCredentials = {
  applicant: {
    mobileNumber: "9000000001",
    otp: "123456",
  },
  operator: {
    password: "demo-only",
    username: "operator.demo",
  },
} as const

const mockSubjects: Record<MockRole, string> = {
  applicant: "demo-applicant-001",
  operator: "demo-operator-001",
}

const sessionKeys: Record<MockRole, string> = {
  applicant: "digilicense.mock-session.applicant",
  operator: "digilicense.mock-session.operator",
}

const sessionEvent = "digilicense:mock-session-change"

function validateMockCredentials(
  role: MockRole,
  values: Record<string, FormDataEntryValue>
) {
  const expectedCredentials = mockCredentials[role]

  return (
    Object.keys(values).length === Object.keys(expectedCredentials).length &&
    Object.entries(expectedCredentials).every(
      ([name, expectedValue]) => values[name] === expectedValue
    )
  )
}

function isValidStoredMockSession(
  storedValue: string | null,
  expectedRole: MockRole,
  now = Date.now()
) {
  if (!storedValue) return false

  let session: unknown

  try {
    session = JSON.parse(storedValue)
  } catch {
    return false
  }

  if (!session || typeof session !== "object") return false

  const candidate = session as Partial<MockSession>

  return (
    candidate.version === 1 &&
    candidate.role === expectedRole &&
    candidate.subjectId === mockSubjects[expectedRole] &&
    typeof candidate.issuedAt === "number" &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.issuedAt) &&
    Number.isFinite(candidate.expiresAt) &&
    candidate.issuedAt <= now &&
    candidate.expiresAt > now &&
    candidate.expiresAt - candidate.issuedAt === mockSessionDurationMs
  )
}

function hasMockSession(role: MockRole) {
  if (typeof window === "undefined") return false

  const storedValue = window.localStorage.getItem(sessionKeys[role])
  const isValid = isValidStoredMockSession(storedValue, role)

  if (!isValid && storedValue) {
    window.localStorage.removeItem(sessionKeys[role])
  }

  return isValid
}

function subscribeToMockSession(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(sessionEvent, callback)
  const expiryCheck = window.setInterval(callback, 30_000)

  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(sessionEvent, callback)
    window.clearInterval(expiryCheck)
  }
}

function useMockSession(role: MockRole) {
  const [isSignedIn, setIsSignedIn] = useState(false)

  useEffect(() => {
    const syncSession = () => setIsSignedIn(hasMockSession(role))

    syncSession()
    return subscribeToMockSession(syncSession)
  }, [role])

  return isSignedIn
}

function startMockSession(role: MockRole) {
  const issuedAt = Date.now()
  const session: MockSession = {
    expiresAt: issuedAt + mockSessionDurationMs,
    issuedAt,
    role,
    subjectId: mockSubjects[role],
    version: 1,
  }

  window.localStorage.setItem(sessionKeys[role], JSON.stringify(session))
  window.dispatchEvent(new Event(sessionEvent))
}

function endMockSession(role: MockRole) {
  window.localStorage.removeItem(sessionKeys[role])
  window.dispatchEvent(new Event(sessionEvent))
}

export {
  endMockSession,
  isValidStoredMockSession,
  mockCredentials,
  mockSessionDurationMs,
  startMockSession,
  useMockSession,
  validateMockCredentials,
}
export type { MockRole }
