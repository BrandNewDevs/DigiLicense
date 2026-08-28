const serverFunctionTimeoutMs = 10_000

async function withServerDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("Server function request timed out.")),
      { once: true }
    )
  })

  const timeout = setTimeout(() => controller.abort(), serverFunctionTimeoutMs)
  try {
    return await Promise.race([operation(controller.signal), aborted])
  } finally {
    clearTimeout(timeout)
  }
}

export { serverFunctionTimeoutMs, withServerDeadline }
