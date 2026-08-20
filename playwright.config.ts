import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // axe-playwright injects axe-core via page.addScriptTag which is blocked
    // by the app's Content-Security-Policy meta tag. bypassCSP lets the test
    // runner inject scripts without relaxing the production CSP.
    bypassCSP: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the Vite dev server before the tests run.
  // Locally: reuse whatever is already running (make frontend in another terminal).
  //   Attempting to start a second server on port 3000 causes EADDRINUSE → all tests fail.
  // CI: always start fresh — no prior server is running.
  webServer: {
    command: "npm run frontend",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
