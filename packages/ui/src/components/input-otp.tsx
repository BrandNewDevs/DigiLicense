import { MinusIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

type InputOTPSlotState = {
  char: string
  hasFakeCaret: boolean
  isActive: boolean
}

type InputOTPContextValue = {
  slots: InputOTPSlotState[]
}

type InputOTPProps = Omit<
  React.ComponentProps<"input">,
  "maxLength" | "onChange" | "value"
> & {
  containerClassName?: string
  maxLength: number
  onChange?: (value: string) => void
  value: string
}

const InputOTPContext = React.createContext<InputOTPContextValue | null>(null)

function InputOTP({
  className,
  children,
  containerClassName,
  maxLength,
  onBlur,
  onChange,
  onFocus,
  onSelect,
  value,
  ...props
}: InputOTPProps) {
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [isFocused, setIsFocused] = React.useState(false)
  const safeValue = value.slice(0, maxLength)
  const slots = Array.from({ length: maxLength }, (_, index) => ({
    char: safeValue[index] ?? "",
    hasFakeCaret:
      isFocused && index === activeIndex && index >= safeValue.length,
    isActive: isFocused && index === activeIndex,
  }))

  const setSelectionIndex = (input: HTMLInputElement) => {
    const selectionIndex = input.selectionStart ?? safeValue.length
    setActiveIndex(Math.min(selectionIndex, maxLength - 1))
  }

  return (
    <InputOTPContext.Provider value={{ slots }}>
      <div
        className={cn(
          "relative flex items-center has-disabled:opacity-50",
          containerClassName
        )}
        data-slot="input-otp"
      >
        <input
          {...props}
          className={cn(
            "absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed",
            className
          )}
          maxLength={maxLength}
          onBlur={(event) => {
            setIsFocused(false)
            onBlur?.(event)
          }}
          onChange={(event) => {
            onChange?.(event.currentTarget.value.slice(0, maxLength))
            setSelectionIndex(event.currentTarget)
          }}
          onFocus={(event) => {
            setIsFocused(true)
            setSelectionIndex(event.currentTarget)
            onFocus?.(event)
          }}
          onSelect={(event) => {
            setSelectionIndex(event.currentTarget)
            onSelect?.(event)
          }}
          spellCheck={false}
          value={safeValue}
        />
        {children}
      </div>
    </InputOTPContext.Provider>
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("flex items-center rounded-lg", className)}
      data-slot="input-otp-group"
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const context = React.useContext(InputOTPContext)
  const slot = context?.slots[index]

  return (
    <div
      className={cn(
        "relative flex size-8 items-center justify-center border-y border-r border-input text-sm transition-all outline-none first:rounded-l-lg first:border-l last:rounded-r-lg data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50",
        className
      )}
      data-active={slot?.isActive ?? false}
      data-slot="input-otp-slot"
      {...props}
    >
      {slot?.char}
      {slot?.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      ) : null}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
    >
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
