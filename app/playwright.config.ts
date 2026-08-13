import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Point the suite at a server that is already running — used to run the exact
// same tests against the Cloudflare Workers build (`npm run cf:dev`) instead of
// the Node one, since the runtimes differ enough to be worth checking.
const EXTERNAL = process.env.E2E_BASE_URL;

// The suite is entirely local: the app under test is on 127.0.0.1 and every
// external integration is mocked. Clearing the proxy variables guarantees a
// test can't reach the internet by accident.
//
// Note the suite runs against a production build rather than `next dev`: in
// this sandbox one dev-only chunk is served a 403 before it reaches the
// browser, which breaks hydration and makes every interactive assertion fail
// for a reason that has nothing to do with the app.
for (const key of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
]) {
  delete process.env[key];
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: EXTERNAL ?? `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The suite only talks to the local server and every external call is
        // mocked, so the browser needs no proxy. Disabling it also stops a
        // sandbox proxy from intercepting localhost asset requests.
        launchOptions: { args: ["--no-proxy-server"] },
      },
    },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
        command: "npm run test:server",
        url: `http://127.0.0.1:${PORT}/login`,
        // `next start` reads PORT; passing it as an arg would not survive the
        // build-then-start shell wrapper.
        env: { PORT: String(PORT) },
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
