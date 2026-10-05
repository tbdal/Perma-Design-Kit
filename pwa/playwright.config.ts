import { defineConfig } from '@playwright/test';

// Browser tests (e2e/*.e2e.ts) against the production build (dist/), served by
// scripts/serve-dist.mjs — run `npm run build` first; `npm run deploy` does both.
// Every request to another host is answered by stubs (e2e/helpers.ts), so the
// tests run offline and give the same result every time.
const PORT = 4399;

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1400, height: 950 },
    // The app's service worker fetches same-origin requests itself, past page.route() stubs.
    serviceWorkers: 'block',
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `node scripts/serve-dist.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
