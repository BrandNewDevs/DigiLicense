import { describe, expect, it } from "vitest"

import { validateDatabaseUrl } from "./database-url"

describe("validateDatabaseUrl", () => {
  it("accepts a remote URL that requires TLS", () => {
    expect(
      validateDatabaseUrl(
        "postgresql://user:pass@ep-demo.eu-central-1.aws.neon.tech/db?sslmode=require"
      )
    ).toEqual({ ok: true })
    expect(
      validateDatabaseUrl(
        "postgresql://user:pass@db.example.com/db?sslmode=verify-full"
      )
    ).toEqual({ ok: true })
  })

  it("rejects a remote URL without an sslmode", () => {
    const check = validateDatabaseUrl(
      "postgresql://user:pass@db.example.com/db"
    )

    expect(check.ok).toBe(false)
  })

  it("rejects sslmodes that allow plaintext fallback", () => {
    for (const mode of ["disable", "allow", "prefer"]) {
      const check = validateDatabaseUrl(
        `postgresql://user:pass@db.example.com/db?sslmode=${mode}`
      )

      expect(check.ok).toBe(false)
    }
  })

  it("allows loopback hosts without TLS for local development", () => {
    expect(validateDatabaseUrl("postgresql://user:pass@localhost:5432/db"))
      .toEqual({ ok: true })
    expect(validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/db"))
      .toEqual({ ok: true })
    expect(validateDatabaseUrl("postgresql://user:pass@[::1]:5432/db"))
      .toEqual({ ok: true })
  })

  it("rejects invalid URLs and unsupported protocols", () => {
    expect(validateDatabaseUrl("not-a-url").ok).toBe(false)
    expect(validateDatabaseUrl("mysql://user:pass@db.example.com/db").ok).toBe(
      false
    )
  })
})
