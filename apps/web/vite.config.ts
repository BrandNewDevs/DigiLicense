import { defineConfig } from "vite"
import { configDefaults } from "vitest/config"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { buildSecurityHeaderValues } from "./src/server/security-policy.shared"

const config = defineConfig(({ isPreview }) => {
  const assetSecurityHeaders = buildSecurityHeaderValues(
    isPreview ? "production" : "development"
  )

  return {
    preview: { cors: false, headers: assetSecurityHeaders },
    resolve: { tsconfigPaths: true },
    server: { cors: false, headers: assetSecurityHeaders },
    test: {
      exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
    },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  }
})

export default config
