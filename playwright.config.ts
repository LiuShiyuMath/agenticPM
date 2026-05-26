import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT) || 4123;
const BASE = `http://127.0.0.1:${PORT}`;

// Bypass any system HTTP proxy (e.g. mihomo/Clash) for local probes — otherwise
// Playwright sees a 502 from the proxy and thinks the server is already up.
const NO_PROXY = "127.0.0.1,localhost,::1";
process.env.NO_PROXY = NO_PROXY;
process.env.no_proxy = NO_PROXY;
delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    actionTimeout: 8_000,
    // Bun --hot does first-request bundling that can briefly exceed 15s on a
    // cold route. 30s gives headroom; warm routes still finish in 5-10s.
    navigationTimeout: 30_000,
  },
  webServer: {
    command: `/Users/m1/.npm-global/bin/bun server.ts`,
    url: `${BASE}/api/health`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT: String(PORT),
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-ant-test-placeholder",
      NO_PROXY,
      no_proxy: NO_PROXY,
      PLAYWRIGHT_TEST: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
