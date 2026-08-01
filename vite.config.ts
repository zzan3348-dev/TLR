import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ["**/.codex-tmp/**", "**/dist/**"],
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,mjs}"],
  },
});
