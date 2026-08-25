import { useEffect, useState } from "react"

type MockRole = "applicant"

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
} as const

const mockSubjects: Record<MockRole, string> = {
  applicant: "demo-applicant-001",
}

const sessionKeys: Record<MockRole, string> = {
  applicant: "digilicense.mock-session.applicant",
}

const sessionEvent = "digilicense:mock-session-change"

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

  try {
    window.localStorage.setItem(sessionKeys[role], JSON.stringify(session))
  } catch {
    // Storage may be unavailable (private mode, quota). Sign-in then only
    // lasts for this page load instead of crashing; that beats failing the
    // whole page after the applicant entered a valid code.
  }
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
}
export type { MockRole }
