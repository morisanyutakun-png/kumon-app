import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 設定。`npm run dev` を起動して http://localhost:3000 をテストする。
 * 既にローカル DB(Docker Postgres / Neon) とシードが入っている前提。
 * webServer は Next が .env を自動読込するため env の手動指定は不要。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
