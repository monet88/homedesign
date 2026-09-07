import { defineConfig, devices } from "@playwright/test";

// Playwright config for HomeDesign (ticket 01, spec #72).
// Viewports: desktop 1440x900 (per spec 0001), mobile 390x844.
// Supports:
//   - Local development default: baseURL http://localhost:3000 with local webServer.
//   - Remote Public Demo mode: PLAYWRIGHT_BASE_URL or DEMO_BASE_URL overrides baseURL,
//     disables local webServer, and supports operator-provided runtime/ignored auth storage state.

const remoteBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.DEMO_BASE_URL ||
  process.env.BASE_URL;

const baseURL = remoteBaseURL || "http://localhost:3000";
const isRemote = Boolean(remoteBaseURL);

// Support operator-provided ignored/runtime auth storage state (e.g. for Google-authenticated demo smoke)
const authStorageState = process.env.PLAYWRIGHT_STORAGE_STATE;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 45_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: authStorageState || undefined,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        hasTouch: true,
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  // Only launch local dev server when NOT running against a remote URL
  webServer: isRemote
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_DEV_CMD || "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
