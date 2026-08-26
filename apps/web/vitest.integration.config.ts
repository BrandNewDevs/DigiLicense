import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    fileParallelism: false,
    include: ["src/**/*.integration.test.ts"],
    maxWorkers: 1,
    setupFiles: ["src/test/integration.setup.ts"],
  },
})
