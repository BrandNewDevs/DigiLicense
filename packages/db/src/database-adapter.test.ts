import { describe, expect, it } from "vitest"

import {
  databaseStatementTimeoutMs,
  withDatabaseStatementTimeout,
} from "./database-adapter.ts"

describe("database adapter connection options", () => {
  it("omits unsupported startup options for Neon pooled endpoints", () => {
    const result = withDatabaseStatementTimeout(
      "postgresql://user:password@ep-example-pooler.c-3.ap-southeast-1.aws.neon.tech/digilicense?sslmode=require&channel_binding=require"
    )

    expect(new URL(result).searchParams.has("options")).toBe(false)
  })

  it("retains statement timeouts for direct PostgreSQL endpoints", () => {
    const result = withDatabaseStatementTimeout(
      "postgresql://user:password@ep-example.c-3.ap-southeast-1.aws.neon.tech/digilicense?sslmode=require"
    )

    expect(new URL(result).searchParams.get("options")).toBe(
      `-c statement_timeout=${databaseStatementTimeoutMs}`
    )
  })

  it("preserves existing startup options when adding the timeout", () => {
    const result = withDatabaseStatementTimeout(
      "postgresql://user:password@localhost:5432/digilicense?sslmode=require&options=-c%20lock_timeout%3D5000"
    )

    expect(new URL(result).searchParams.get("options")).toBe(
      `-c lock_timeout=5000 -c statement_timeout=${databaseStatementTimeoutMs}`
    )
  })
})
