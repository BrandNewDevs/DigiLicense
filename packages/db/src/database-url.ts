type DatabaseUrlCheck = { ok: true } | { ok: false; message: string }

const postgresProtocols = new Set(["postgres:", "postgresql:"])

const tlsRequiredSslModes = new Set(["require", "verify-ca", "verify-full"])

function validateDatabaseUrl(databaseUrl: string): DatabaseUrlCheck {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(databaseUrl)
  } catch {
    return {
      ok: false,
      message: "DATABASE_URL must be a valid PostgreSQL connection URL.",
    }
  }

  if (!postgresProtocols.has(parsedUrl.protocol)) {
    return {
      ok: false,
      message: "DATABASE_URL must use the postgres or postgresql protocol.",
    }
  }

  const sslMode = parsedUrl.searchParams.get("sslmode")?.trim().toLowerCase()

  if (!sslMode || !tlsRequiredSslModes.has(sslMode)) {
    return {
      ok: false,
      message:
        "DATABASE_URL must require TLS. Add sslmode=require (or verify-ca / verify-full) to the connection URL.",
    }
  }

  return { ok: true }
}

export { validateDatabaseUrl }
export type { DatabaseUrlCheck }
