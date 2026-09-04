import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure parts of the app: chord grammar, transposition, and
 * anything else that is a function of its arguments and nothing else.
 *
 * Anything that depends on how a browser lays text out is not testable here and
 * belongs in scripts/typography-check.mjs, which drives real Chromium.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
