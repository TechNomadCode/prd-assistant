import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on its own port, never the
// dev server, so they test what users get.
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const REPLAY_PORT = 3101;
const REPLAY_URL = `http://127.0.0.1:${REPLAY_PORT}`;

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
  // Playwright starts its servers one after another, each once the one
  // before answers (`createPluginSetupTasks` in the installed runner, read
  // 2026-10-21), so the second starts on the build the first made. It runs
  // the chat on the replayed answers (`npm run dev:replay`'s model), a
  // hundred times faster than recorded; only `tests/e2e/replay.spec.ts` uses
  // it, and every other test stays on the scripted fake.
  webServer: [
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "pipe",
    },
    {
      command: `npm run start -- --port ${REPLAY_PORT}`,
      url: REPLAY_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      env: { AI_CHAT_PROVIDER: "replay", REPLAY_SPEED: "100" },
    },
  ],
});
