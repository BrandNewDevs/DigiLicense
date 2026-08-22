type DatabaseUrlCheck = { ok: true } | { ok: false; message: string }

const postgresProtocols = new Set(["postgres:", "postgresql:"])

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"])

// "allow" and "prefer" can fall back to plaintext, so only modes that
// guarantee an encrypted connection are accepted for remote hosts.
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

  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "")

  if (loopbackHosts.has(hostname)) {
    return { ok: true }
  }

  const sslMode = parsedUrl.searchParams.get("sslmode")?.trim().toLowerCase()

  if (!sslMode || !tlsRequiredSslModes.has(sslMode)) {
    return {
      ok: false,
      message:
        "DATABASE_URL must require TLS for remote hosts. Add sslmode=require (or verify-ca / verify-full) to the connection URL.",
    }
  }

  return { ok: true }
}

export { validateDatabaseUrl }
export type { DatabaseUrlCheck }
