// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// 빌드 없는 정적 앱 — 파이썬 내장 서버로 서빙하고 크로미움으로만 검증.
// (file:// 은 localStorage·fetch 제약이 있어 http로 띄움)
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://localhost:8000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
