import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    fileParallelism: false,
    include: ["src/**/*.ai-integration.test.ts"],
    maxWorkers: 1,
  },
})
