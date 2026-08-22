import { describe, expect, it } from "vitest"

import { validateDatabaseUrl } from "./database-url"

describe("validateDatabaseUrl", () => {
  it("allows a local PostgreSQL URL without a TLS mode", () => {
    expect(
      validateDatabaseUrl("postgresql://localhost:5432/digilicense")
    ).toEqual({
      ok: true,
    })
  })

  it("requires TLS for a remote PostgreSQL URL", () => {
    expect(
      validateDatabaseUrl("postgresql://db.example.test:5432/digilicense")
    ).toEqual({
      ok: false,
      message:
        "DATABASE_URL must require TLS for remote hosts. Add sslmode=require (or verify-ca / verify-full) to the connection URL.",
    })
  })
})
