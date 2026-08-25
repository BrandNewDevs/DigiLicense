type ExpiryCleanup = () => void

function scheduleMobileUpdateExpiry(
  expiresAt: string,
  onExpired: () => void
): ExpiryCleanup {
  const expiryTimestamp = Date.parse(expiresAt)
  const delay = Number.isNaN(expiryTimestamp)
    ? 0
    : Math.max(0, expiryTimestamp - Date.now())
  const timer = setTimeout(onExpired, delay)

  return () => clearTimeout(timer)
}

export { scheduleMobileUpdateExpiry }
export type { ExpiryCleanup }
