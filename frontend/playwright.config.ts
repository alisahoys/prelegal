import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3100",
        url: "http://localhost:3100",
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
