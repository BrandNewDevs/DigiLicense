import { fileURLToPath } from "node:url"

import { config } from "dotenv"
import { defineConfig, env } from "prisma/config"

// The web application owns runtime environment loading. Prisma commands run
// from this package, so load the same uncommitted development environment.
config({ path: fileURLToPath(new URL("../../apps/web/.env", import.meta.url)) })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
