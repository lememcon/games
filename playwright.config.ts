import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // vite.config.ts opens a browser on port 3000; override both. The API is
    // always mocked in the tests, so the SPA talks to the relative /api path.
    command: `pnpm exec vite --port ${port} --strictPort --open false`,
    url: `http://localhost:${port}`,
    env: { VITE_API_URL: "" },
    reuseExistingServer: !process.env.CI,
  },
});
