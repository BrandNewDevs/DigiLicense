const serverFunctionTimeoutMs = 10_000

async function withServerDeadline<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Server function request timed out."))
        }, serverFunctionTimeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export { serverFunctionTimeoutMs, withServerDeadline }
