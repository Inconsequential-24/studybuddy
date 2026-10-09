import { defineConfig } from "@playwright/test";

// Auth state is supplied by the testing runner's programmatic Clerk login.
// Never commit this file; it contains session cookies.
if (!process.env.RETRY_AUTH_STATE) throw new Error("RETRY_AUTH_STATE must point to a signed-in Clerk storage state");
if (!process.env.RETRY_BASE_URL) throw new Error("RETRY_BASE_URL must point to the running proxied app");

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 12000 },
  use: {
    baseURL: process.env.RETRY_BASE_URL,
    storageState: process.env.RETRY_AUTH_STATE,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.RETRY_CHROMIUM_PATH ? { executablePath: process.env.RETRY_CHROMIUM_PATH } : {},
  },
});
