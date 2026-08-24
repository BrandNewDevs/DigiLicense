import {
  Binoculars,
  Minus,
  RotateCcw,
  TextCursorInput,
  Plus,
} from "lucide-react"
import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

type TextScale = "small" | "default" | "large"
type ContentWidth = "standard" | "wide"

type DisplayPreferences = {
  contentWidth: ContentWidth
  textScale: TextScale
}

type DisplayPreferencesContextValue = DisplayPreferences & {
  resetPreferences: () => void
  setContentWidth: (contentWidth: ContentWidth) => void
  setTextScale: (textScale: TextScale) => void
}

const displayPreferencesStorageKey = "digilicense.display-preferences"
const defaultPreferences: DisplayPreferences = {
  contentWidth: "standard",
  textScale: "default",
}

const DisplayPreferencesContext =
  createContext<DisplayPreferencesContextValue | null>(null)

function isDisplayPreferences(value: unknown): value is DisplayPreferences {
  if (!value || typeof value !== "object") return false

  const preferences = value as Record<string, unknown>
  return (
    (preferences.textScale === "small" ||
      preferences.textScale === "default" ||
      preferences.textScale === "large") &&
    (preferences.contentWidth === "standard" ||
      preferences.contentWidth === "wide")
  )
}

function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] =
    useState<DisplayPreferences>(defaultPreferences)
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)

  useEffect(() => {
    const storedPreferences = window.localStorage.getItem(
      displayPreferencesStorageKey
    )

    if (storedPreferences) {
      try {
        const parsedPreferences: unknown = JSON.parse(storedPreferences)

        if (isDisplayPreferences(parsedPreferences)) {
          setPreferences(parsedPreferences)
        }
      } catch {
        window.localStorage.removeItem(displayPreferencesStorageKey)
      }
    }

    setHasLoadedPreferences(true)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.digilicenseTextScale = preferences.textScale
    root.dataset.digilicenseContentWidth = preferences.contentWidth

    if (hasLoadedPreferences) {
      window.localStorage.setItem(
        displayPreferencesStorageKey,
        JSON.stringify(preferences)
      )
    }
  }, [hasLoadedPreferences, preferences])

  return (
    <DisplayPreferencesContext.Provider
      value={{
        ...preferences,
        resetPreferences: () => setPreferences(defaultPreferences),
        setContentWidth: (contentWidth) =>
          setPreferences((current) => ({ ...current, contentWidth })),
        setTextScale: (textScale) =>
          setPreferences((current) => ({ ...current, textScale })),
      }}
    >
      {children}
    </DisplayPreferencesContext.Provider>
  )
}

function useDisplayPreferences() {
  const context = useContext(DisplayPreferencesContext)

  if (!context) {
    throw new Error(
      "useDisplayPreferences must be used within DisplayPreferencesProvider"
    )
  }

  return context
}

function DisplayPreferencesControl() {
  const {
    contentWidth,
    resetPreferences,
    setContentWidth,
    setTextScale,
    textScale,
  } = useDisplayPreferences()

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Display settings"
        className="inline-flex size-9 items-center justify-center rounded-full bg-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        title="Display settings"
      >
        <Binoculars className="size-4" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-72 gap-0 rounded-2xl border border-border bg-card p-4 text-sm shadow-lg"
        sideOffset={8}
      >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-base font-semibold">Display</h2>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                Adjust the page for easier reading.
              </p>
            </div>
            <TextCursorInput
              className="mt-0.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </div>

          <div aria-hidden="true" className="mt-3 border-t border-border" />

          <fieldset className="pt-3">
            <legend className="font-medium">Text size</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2" role="group">
              {[
                { icon: Minus, label: "Small", value: "small" },
                { icon: TextCursorInput, label: "Default", value: "default" },
                { icon: Plus, label: "Large", value: "large" },
              ].map(({ icon: Icon, label, value }) => (
                <button
                  aria-pressed={textScale === value}
                  className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    textScale === value
                      ? "border-black bg-black text-white"
                      : "border-border bg-background text-foreground hover:border-black"
                  }`}
                  key={value}
                  onClick={() => setTextScale(value as TextScale)}
                  type="button"
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div aria-hidden="true" className="mt-3 border-t border-border" />

          <fieldset className="pt-3">
            <legend className="font-medium">Content width</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="group">
              {[
                { label: "Standard", value: "standard" },
                { label: "Wide", value: "wide" },
              ].map(({ label, value }) => (
                <button
                  aria-pressed={contentWidth === value}
                  className={`min-h-10 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    contentWidth === value
                      ? "border-black bg-black text-white"
                      : "border-border bg-background text-foreground hover:border-black"
                  }`}
                  key={value}
                  onClick={() => setContentWidth(value as ContentWidth)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div aria-hidden="true" className="mt-3 border-t border-border" />

          <div className="pt-1">
            <button
              className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={resetPreferences}
              type="button"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset display settings
            </button>
          </div>
      </PopoverContent>
    </Popover>
  )
}

export {
  DisplayPreferencesControl,
  DisplayPreferencesProvider,
  useDisplayPreferences,
}
