import { defineConfig } from "@playwright/test";

/**
 * Visual regression snapshot suite (#432). Separate from playwright.config.ts
 * so a normal `npm run test:e2e` never touches pixel baselines — only specs
 * named `*.visual.spec.ts` run here, and the main config explicitly ignores
 * them (see testIgnore in playwright.config.ts).
 *
 * Baselines live in tests/e2e/__snapshots__/ and are committed. To refresh
 * them after an intentional design change: `npm run test:visual:update`.
 * See TESTING.md → "Visual regression tests" for the full workflow.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.visual.spec.ts",
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}-{projectName}{ext}",

  expect: {
    toHaveScreenshot: {
      // Two pages of the same commit should never differ by more than a
      // hairline of anti-aliasing noise; 0.1% catches real drift without
      // flaking on font subpixel rendering.
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
    },
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    bypassCSP: true,
  },

  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],

  webServer: {
    command: "npm run frontend",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
