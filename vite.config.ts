import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    open: true,
    port: 3000,
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: "./src/test/setup.ts",
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["server/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: [
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/types.ts",
        "src/test/**",
        "server/index.ts",
        "server/migrate.ts",
        "server/db/**",
        "server/types.ts",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
