import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] || 'http://localhost:4200';

const testDatabaseUrl =
  process.env['E2E_DATABASE_URL'] ||
  (process.env['DATABASE_URL']
    ? process.env['DATABASE_URL'].replace(/\/[^/]+$/, '/cardquorum_test')
    : 'postgresql://cardquorum:password@localhost:5432/cardquorum_test');

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  globalSetup: './src/setup/global-setup',
  globalTeardown: './src/setup/global-teardown',
  timeout: 30_000,
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  webServer: {
    command: `DATABASE_URL=${testDatabaseUrl} AUTH_STRATEGIES=basic NODE_ENV=test pnpm exec nx run frontend:serve`,
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
