import { beforeAll } from "vitest"

function assertIntegrationDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL

  if (process.env.DIGILICENSE_INTEGRATION_TEST !== "true") {
    throw new Error(
      "Integration tests require DIGILICENSE_INTEGRATION_TEST=true."
    )
  }

  if (!databaseUrl) {
    throw new Error("Integration tests require DATABASE_URL.")
  }

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error("Integration tests require a valid PostgreSQL DATABASE_URL.")
  }

  if (parsed.pathname !== "/digilicense_integration") {
    throw new Error(
      "Integration tests may run only against the digilicense_integration database."
    )
  }
}

beforeAll(assertIntegrationDatabase)

export { assertIntegrationDatabase }
