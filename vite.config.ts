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
    // Local dev needs the API (pnpm server:dev), Postgres and Discord keys.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8080",
      },
    },
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
          exclude: ["server/db/**"],
        },
      },
      {
        // Real SQL against in-process Postgres (PGlite); slower to boot.
        extends: true,
        test: {
          name: "server-db",
          environment: "node",
          include: ["server/db/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
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
        "server/testing.ts",
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
