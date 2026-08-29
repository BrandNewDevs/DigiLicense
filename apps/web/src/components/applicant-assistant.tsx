import { Link, useRouterState } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { Bot, Send, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import { formatAssistantRetryMessage } from "../lib/assistant-copy"
import { questionContainsSensitiveData } from "../lib/assistant-safety"
import { useAssistantPublicContext } from "../lib/assistant-public-context"
import { askAssistant } from "../server-functions/assistant"
import type { AskAssistantInput } from "../validation/assistant"

type AssistantResult = Awaited<ReturnType<typeof askAssistant>>
type Locale = AskAssistantInput["locale"]
type ChatMessage =
  | { id: string; kind: "question"; text: string }
  | {
      id: string
      kind: "answer"
      locale: Locale
      result: AssistantResult
    }

const suggestedQuestions = [
  "What should I do next?",
  "Why is this action unavailable?",
  "How does the appointment waitlist work?",
] as const

function clientFallback(
  locale: Locale,
  reason: "sensitive-input" | "unavailable"
): AssistantResult {
  const answer =
    reason === "sensitive-input"
      ? locale === "hi"
        ? "आपकी गोपनीयता के लिए, मार्गदर्शन मांगने से पहले निजी, आवेदन, दस्तावेज़, संपर्क या भुगतान जानकारी हटा दें।"
        : "For your privacy, remove personal, application, document, contact, or payment information before asking for guidance."
      : locale === "hi"
        ? "मार्गदर्शन अभी उपलब्ध नहीं है। इस पेज की जानकारी देखें और बाद में फिर प्रयास करें।"
        : "Guidance is temporarily unavailable. Review the information on this page and try again later."

  return {
    kind: "fallback",
    reason,
    response: {
      answer,
      blockedReason:
        reason === "sensitive-input" ? "PII_DETECTED" : "PROVIDER_UNAVAILABLE",
      contextToken: null,
      escalation: null,
      fallbackUsed: true,
      intent: "UNSUPPORTED_QUESTION",
      sources: [],
      uncertain: true,
    },
  }
}

function AssistantForm({ onAnswered }: { onAnswered?: () => void }) {
  const ask = useServerFn(askAssistant)
  const publicContext = useAssistantPublicContext()
  const questionId = useId()
  const [locale, setLocale] = useState<Locale>("en")
  const [question, setQuestion] = useState("")
  const [contextToken, setContextToken] = useState<string>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const service = publicContext.service

  useEffect(() => {
    setContextToken(undefined)
  }, [publicContext.page, publicContext.reasonCode, publicContext.service])

  async function submitQuestion(value: string) {
    const trimmedQuestion = value.trim()
    if (!trimmedQuestion || isSubmitting) return

    if (questionContainsSensitiveData(trimmedQuestion)) {
      const fallback = clientFallback(locale, "sensitive-input")
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: "question", text: trimmedQuestion },
        {
          id: crypto.randomUUID(),
          kind: "answer",
          locale,
          result: fallback,
        },
      ])
      setQuestion("")
      return
    }

    setIsSubmitting(true)
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: "question", text: trimmedQuestion },
    ])
    setQuestion("")
    try {
      const next = await ask({
        data: {
          ...(contextToken ? { contextToken } : {}),
          locale,
          page: publicContext.page,
          question: trimmedQuestion,
          reasonCode: publicContext.reasonCode,
          service,
        },
      })
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: "answer", locale, result: next },
      ])
      if (next.kind !== "authentication-required") {
        setContextToken(next.response.contextToken ?? undefined)
      }
      onAnswered?.()
    } catch {
      const fallback = clientFallback(locale, "unavailable")
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: "answer", locale, result: fallback },
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end">
        <div
          className="flex h-11 items-center rounded-full border border-border bg-background p-1"
          role="group"
        >
          <Button
            aria-label="English"
            aria-pressed={locale === "en"}
            className="h-9 rounded-full px-3"
            onClick={() => {
              setContextToken(undefined)
              setLocale("en")
            }}
            size="sm"
            type="button"
            variant={locale === "en" ? "solid" : "ghost"}
          >
            EN
          </Button>
          <Button
            aria-label="Hindi"
            aria-pressed={locale === "hi"}
            className="h-9 rounded-full px-3"
            onClick={() => {
              setContextToken(undefined)
              setLocale("hi")
            }}
            size="sm"
            type="button"
            variant={locale === "hi" ? "solid" : "ghost"}
          >
            हिं
          </Button>
        </div>
      </div>

      {messages.length ? (
        <section
          aria-live="polite"
          className="scrollbar-hidden mt-5 space-y-4 overflow-y-auto"
        >
          {messages.map((message) =>
            message.kind === "question" ? (
              <p
                className="ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
                key={message.id}
              >
                {message.text}
              </p>
            ) : (
              <AssistantAnswer
                key={message.id}
                locale={message.locale}
                result={message.result}
              />
            )
          )}
          {isSubmitting ? <AssistantThinkingIndicator /> : null}
        </section>
      ) : (
        <div className="mt-8">
          <p className="text-center text-sm text-muted-foreground">
            Try one of these questions
          </p>
          <div
            className="mt-3 flex flex-wrap justify-center gap-2"
            aria-label="Suggested questions"
          >
            {suggestedQuestions.map((suggestion) => (
              <Button
                key={suggestion}
                onClick={() => void submitQuestion(suggestion)}
                size="sm"
                type="button"
                variant="outline"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}

      <form
        className="mt-auto pt-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submitQuestion(question)
        }}
      >
        <label className="sr-only" htmlFor={questionId}>
          Your question
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-input bg-background p-2">
          <Textarea
            className="min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
            id={questionId}
            maxLength={500}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a guidance question..."
            rows={1}
            value={question}
          />
          <Button
            aria-label="Send question"
            className="shrink-0 rounded-full p-0"
            disabled={!question.trim() || isSubmitting}
            size="icon-lg"
            type="submit"
          >
            <Send aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
          Do not enter application, identity, contact, document, or payment
          details.
        </p>
      </form>
    </div>
  )
}

function AssistantThinkingIndicator() {
  return (
    <div
      aria-label="Checking guidance"
      className="flex w-fit items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground"
      role="status"
    >
      <Bot aria-hidden="true" className="size-4" />
      Checking guidance
      <span aria-hidden="true" className="flex gap-1">
        <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-bounce" />
        <span className="size-1.5 rounded-full bg-muted-foreground [animation-delay:150ms] motion-safe:animate-bounce" />
        <span className="size-1.5 rounded-full bg-muted-foreground [animation-delay:300ms] motion-safe:animate-bounce" />
      </span>
    </div>
  )
}

function AssistantAnswer({
  locale,
  result,
}: {
  locale: Locale
  result: AssistantResult
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const returnTo =
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/services")
      ? pathname
      : "/services"

  if (result.kind === "authentication-required") {
    return (
      <section
        className="mt-6 rounded-xl border border-border p-4"
        role="status"
      >
        <p>{result.message}</p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          search={{ returnTo }}
          to="/applicant/login"
        >
          Sign in
        </Link>
      </section>
    )
  }

  const { response } = result
  return (
    <section aria-live="polite" className="mt-6 rounded-xl bg-muted p-5">
      <p className="text-sm font-semibold text-primary">
        {response.fallbackUsed ? "Guidance" : "Answer"}
      </p>
      <p className="mt-2 leading-7">{response.answer}</p>
      {response.uncertain ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This guidance may not cover your situation fully.
        </p>
      ) : null}
      {response.escalation ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {response.escalation.message}
        </p>
      ) : null}
      {result.kind === "fallback" && result.retryAfterSeconds ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {formatAssistantRetryMessage(locale, result.retryAfterSeconds)}
        </p>
      ) : null}
      {response.sources.length ? (
        <section aria-labelledby="guidance-sources" className="mt-5">
          <h3 className="text-sm font-semibold" id="guidance-sources">
            Sources
          </h3>
          <ul className="mt-2 space-y-2 text-sm">
            {response.sources.map((source) => (
              <li key={source.id}>{source.title}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}

function ApplicantAssistantLauncher() {
  const [isOpen, setIsOpen] = useState(false)
  const assistantPanelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const assistantTitleId = useId()

  useEffect(() => {
    if (isOpen) {
      assistantPanelRef.current?.focus()
    } else if (wasOpenRef.current) {
      launcherRef.current?.focus()
    }

    wasOpenRef.current = isOpen
  }, [isOpen])

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      setIsOpen(false)
      return
    }

    if (event.key !== "Tab") return

    const panel = assistantPanelRef.current
    if (!panel) return

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getAttribute("aria-hidden") !== "true")

    if (!focusableElements.length) {
      event.preventDefault()
      panel.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    if (
      event.shiftKey &&
      (activeElement === firstElement || activeElement === panel)
    ) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <>
      {isOpen ? (
        <aside
          aria-labelledby={assistantTitleId}
          aria-modal="true"
          className="fixed inset-0 z-40 flex flex-col overflow-hidden border-border bg-background p-4 shadow-2xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(700px,calc(100svh-3rem))] sm:w-[min(480px,calc(100vw-3rem))] sm:rounded-3xl sm:border sm:p-6"
          onKeyDown={handlePanelKeyDown}
          ref={assistantPanelRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Bot aria-hidden="true" className="size-5 text-primary" />
              DigiLicense guidance
            </p>
            <Button
              aria-label="Close guidance assistant"
              onClick={() => setIsOpen(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-6" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-4 sm:py-5">
            <div className="mx-auto w-full max-w-xl text-center">
              <h2
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
                id={assistantTitleId}
              >
                How can we help?
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Ask about a DigiLicense service in English or Hindi.
              </p>
            </div>
            <div className="mx-auto mt-auto w-full max-w-xl pt-4 sm:pt-6">
              <AssistantForm />
            </div>
          </div>
        </aside>
      ) : null}
      <Button
        aria-label="Open guidance assistant"
        className="fixed right-4 bottom-24 z-30 size-12 rounded-full p-0 shadow-lg sm:right-6 sm:bottom-6 sm:min-h-12 sm:w-auto sm:px-4"
        onClick={() => setIsOpen(true)}
        ref={launcherRef}
        type="button"
      >
        <Bot aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">Get guidance</span>
      </Button>
    </>
  )
}

export { ApplicantAssistantLauncher }
