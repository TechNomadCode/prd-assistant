import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on its own port, never the
// dev server, so they test what users get.
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // The fake model streams its parts 15ms apart, so a drafted section takes
  // about 1.5s alone and, under load, past the default 5s: full runs with six
  // workers timed out waiting for an answer to end now and then (2026-10-20
  // and 21), and 10 tests of 90 with twelve. The waits keep their conditions;
  // only how long they may take changes.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
  },
});
