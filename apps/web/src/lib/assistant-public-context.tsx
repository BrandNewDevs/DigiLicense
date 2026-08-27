import { useRouterState } from "@tanstack/react-router"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"

import type { AskAssistantInput } from "../validation/assistant"

type AssistantPublicContext = Pick<
  AskAssistantInput,
  "page" | "reasonCode" | "service"
>
type AssistantPublicContextOverride = Partial<AssistantPublicContext>
type AssistantPublicContextValue = {
  clearOverride: () => void
  context: AssistantPublicContext
  setOverride: (next: AssistantPublicContextOverride) => void
}

const defaultAssistantPublicContext: AssistantPublicContext = {
  page: "assistant",
  reasonCode: "NONE",
  service: "appointment-waitlist",
}

const serviceRouteContexts: Record<string, AssistantPublicContext> = {
  appointments: {
    page: "appointment-booking",
    reasonCode: "NONE",
    service: "appointment-waitlist",
  },
  "change-address": {
    page: "guided-application",
    reasonCode: "NONE",
    service: "change-address",
  },
  "duplicate-licence": {
    page: "guided-application",
    reasonCode: "NONE",
    service: "duplicate-replacement",
  },
  fees: {
    page: "payment",
    reasonCode: "NONE",
    service: "fees-payment",
  },
  "learner-licence": {
    page: "guided-application",
    reasonCode: "NONE",
    service: "learner-licence",
  },
  "learner-test": {
    page: "learner-test",
    reasonCode: "NONE",
    service: "learner-test",
  },
  "permanent-licence": {
    page: "eligibility",
    reasonCode: "NONE",
    service: "permanent-driving-licence",
  },
  "renew-licence": {
    page: "guided-application",
    reasonCode: "NONE",
    service: "renewal",
  },
  "track-application": {
    page: "application-status",
    reasonCode: "NONE",
    service: "application-status",
  },
  "update-mobile": {
    page: "guided-application",
    reasonCode: "NONE",
    service: "mobile-update",
  },
}

const blockingReasonContexts: Record<string, AskAssistantInput["reasonCode"]> =
  {
    APPOINTMENT_OFFER_ACTION_REQUIRED: "OFFER_PENDING",
    APPOINTMENT_PREFERENCES_REQUIRED: "PREPARATION_REQUIRED",
    APPOINTMENT_SLOT_UNAVAILABLE: "NO_MATCHING_SLOT",
    APPROVAL_REVIEW_PENDING: "ACTION_LOCKED",
    CORRECTION_REQUIRED: "ACTION_LOCKED",
    DOCUMENT_REVIEW_PENDING: "ACTION_LOCKED",
    PAYMENT_CONFIRMATION_PENDING: "ACTION_LOCKED",
    TEST_RESULT_PENDING: "ACTION_LOCKED",
    WAITING_PERIOD_NOT_MET: "WAITING_PERIOD_ACTIVE",
  }

const AssistantPublicContextState = createContext<
  AssistantPublicContextValue | undefined
>(undefined)

function getRouteAssistantPublicContext(
  pathname: string
): AssistantPublicContext {
  if (pathname === "/dashboard") {
    return {
      page: "dashboard",
      reasonCode: "NONE",
      service: "application-status",
    }
  }

  const match = /^\/services\/([^/]+)\/?$/.exec(pathname)
  if (!match) return defaultAssistantPublicContext

  return serviceRouteContexts[match[1]] ?? defaultAssistantPublicContext
}

function getAssistantReasonForBlockingCode(
  blockingReasonCode: string | null | undefined
): AskAssistantInput["reasonCode"] {
  if (!blockingReasonCode) return "NONE"
  return blockingReasonContexts[blockingReasonCode] ?? "ACTION_LOCKED"
}

function AssistantPublicContextProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const routeContext = useMemo(
    () => getRouteAssistantPublicContext(pathname),
    [pathname]
  )
  const [override, setOverrideState] =
    useState<AssistantPublicContextOverride>()

  useEffect(() => setOverrideState(undefined), [pathname])

  const setOverride = useCallback(
    (next: AssistantPublicContextOverride) => setOverrideState(next),
    []
  )
  const clearOverride = useCallback(() => setOverrideState(undefined), [])
  const context = useMemo(
    () => ({ ...routeContext, ...override }),
    [override, routeContext]
  )
  const value = useMemo(
    () => ({ clearOverride, context, setOverride }),
    [clearOverride, context, setOverride]
  )

  return (
    <AssistantPublicContextState.Provider value={value}>
      {children}
    </AssistantPublicContextState.Provider>
  )
}

function useAssistantPublicContext(): AssistantPublicContext {
  const value = useContext(AssistantPublicContextState)
  return value?.context ?? defaultAssistantPublicContext
}

function useAssistantPublicContextOverride(
  next: AssistantPublicContextOverride
): void {
  const value = useContext(AssistantPublicContextState)
  const clearOverride = value?.clearOverride
  const setOverride = value?.setOverride
  const { page, reasonCode, service } = next

  useEffect(() => {
    if (!clearOverride || !setOverride) return
    setOverride({
      ...(page ? { page } : {}),
      ...(reasonCode ? { reasonCode } : {}),
      ...(service ? { service } : {}),
    })
    return clearOverride
  }, [clearOverride, page, reasonCode, service, setOverride])
}

export {
  AssistantPublicContextProvider,
  defaultAssistantPublicContext,
  getAssistantReasonForBlockingCode,
  getRouteAssistantPublicContext,
  useAssistantPublicContext,
  useAssistantPublicContextOverride,
}
export type { AssistantPublicContext, AssistantPublicContextOverride }
