import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: [
      "convex/**/*.test.ts",
      "electron/**/*.test.ts",
      "scripts/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    environment: "edge-runtime",
  },
})
