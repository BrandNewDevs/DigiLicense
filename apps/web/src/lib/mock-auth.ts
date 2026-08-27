import { useServerFn } from "@tanstack/react-start"
import { useEffect, useState } from "react"

import { readDemoSession } from "../server-functions/demo-auth"

type MockRole = "applicant"

type SessionListener = () => void

const signedInRoles = new Set<MockRole>()
const listeners = new Set<SessionListener>()
const sessionRevisions = new Map<MockRole, number>()

function notifyListeners() {
  for (const listener of listeners) listener()
}

function isMockSessionActive(role: MockRole) {
  return signedInRoles.has(role)
}

function useMockSession(role: MockRole) {
  const readSession = useServerFn(readDemoSession)
  const [isSignedIn, setIsSignedIn] = useState(() => isMockSessionActive(role))

  useEffect(() => {
    const sync = () => setIsSignedIn(isMockSessionActive(role))
    listeners.add(sync)

    const revision = sessionRevisions.get(role) ?? 0

    void readSession({ data: { role } })
      .then((result) => {
        if ((sessionRevisions.get(role) ?? 0) !== revision) return
        if (result.authenticated) signedInRoles.add(role)
        else signedInRoles.delete(role)
        notifyListeners()
      })
      .catch(() => {
        if ((sessionRevisions.get(role) ?? 0) !== revision) return
        signedInRoles.delete(role)
        notifyListeners()
      })

    return () => {
      listeners.delete(sync)
    }
  }, [readSession, role])

  return isSignedIn
}

function startMockSession(role: MockRole) {
  sessionRevisions.set(role, (sessionRevisions.get(role) ?? 0) + 1)
  signedInRoles.add(role)
  notifyListeners()
}

function endMockSession(role: MockRole) {
  sessionRevisions.set(role, (sessionRevisions.get(role) ?? 0) + 1)
  signedInRoles.delete(role)
  notifyListeners()
}

const mockCredentials = {
  applicant: {
    mobileNumber: "9000000001",
    otp: "123456",
  },
} as const

export {
  endMockSession,
  isMockSessionActive,
  mockCredentials,
  startMockSession,
  useMockSession,
}
export type { MockRole }
