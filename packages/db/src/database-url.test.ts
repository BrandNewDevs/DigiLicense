import { describe, expect, it } from "vitest"

import { validateDatabaseUrl } from "./database-url"

const tlsRequiredMessage =
  "DATABASE_URL must require TLS. Add sslmode=require (or verify-ca / verify-full) to the connection URL."

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
})
