type DatabaseUrlCheck = { ok: true } | { ok: false; message: string }

const postgresProtocols = new Set(["postgres:", "postgresql:"])

const tlsRequiredSslModes = new Set(["require", "verify-ca", "verify-full"])

// PostgreSQL treats an empty host or a path-like host as a Unix-domain
// socket, which ignores sslmode entirely. Percent-encoded socket paths
// (for example %2Fvar%2Frun%2Fpostgresql) must be decoded before testing,
// and no valid TCP hostname begins with "." either.
function isEmptyHostOrSocketPath(hostname: string): boolean {
  if (!hostname) {
    return true
  }

  try {
    const decodedHost = decodeURIComponent(hostname)

    return decodedHost.startsWith("/") || decodedHost.startsWith(".")
  } catch {
    return true
  }
}

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

  if (isEmptyHostOrSocketPath(hostname)) {
    return {
      ok: false,
      message:
        "DATABASE_URL must specify a TCP database host. Empty hosts and Unix-domain socket paths are not supported.",
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
