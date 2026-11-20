import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the built files load from the iOS app bundle
// (capacitor://localhost) as well as from any web path.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
