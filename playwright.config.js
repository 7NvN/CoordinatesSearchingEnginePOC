const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'cross-env DB_PATH=./data/e2e.sqlite npm run dev',
      url: 'http://127.0.0.1:3001/health',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev --prefix web -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
