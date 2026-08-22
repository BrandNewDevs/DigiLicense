import { describe, expect, it } from "vitest"

import { validateDatabaseUrl } from "./database-url"

const tlsRequiredMessage =
  "DATABASE_URL must require TLS. Add sslmode=require (or verify-ca / verify-full) to the connection URL."

const tcpHostRequiredMessage =
  "DATABASE_URL must specify a TCP database host. Empty hosts and Unix-domain socket paths are not supported."

describe("validateDatabaseUrl", () => {
  it.each(["require", "verify-ca", "verify-full"])(
    "allows a local PostgreSQL URL with sslmode=%s",
    (sslMode) => {
      expect(
        validateDatabaseUrl(`postgresql://localhost:5432/digilicense?sslmode=${sslMode}`)
      ).toEqual({
        ok: true,
      })
    }
  )

  it.each([
    "postgresql://localhost:5432/digilicense",
    "postgresql://127.0.0.1:5432/digilicense",
    "postgresql://[::1]:5432/digilicense",
    "postgresql://db.example.test:5432/digilicense",
    "postgresql://db.example.test:5432/digilicense?sslmode=prefer",
  ])("requires TLS for %s", (databaseUrl) => {
    expect(validateDatabaseUrl(databaseUrl)).toEqual({
      ok: false,
      message: tlsRequiredMessage,
    })
  })

  it.each([
    "postgresql:///digilicense?sslmode=require",
    "postgresql://%2Fvar%2Frun%2Fpostgresql/digilicense?sslmode=require",
    "postgresql://%2E%2Fpgsocket/digilicense?sslmode=verify-full",
  ])("rejects empty and Unix-socket hosts for %s", (databaseUrl) => {
    expect(validateDatabaseUrl(databaseUrl)).toEqual({
      ok: false,
      message: tcpHostRequiredMessage,
    })
  })

  it("rejects an invalid PostgreSQL URL", () => {
    expect(
      validateDatabaseUrl("postgresql://:5432/digilicense?sslmode=require")
    ).toEqual({
      ok: false,
      message: "DATABASE_URL must be a valid PostgreSQL connection URL.",
    })
  })
})
