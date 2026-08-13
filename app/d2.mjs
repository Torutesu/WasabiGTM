import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("requestfailed", (req) => console.log("[requestfailed]", req.url(), req.failure()?.errorText));

await page.goto("http://127.0.0.1:3102/login");
await page.waitForTimeout(3000);

console.log("--- filling ---");
await page.getByTestId("login-email").fill("founder@wasabi.local");
await page.getByTestId("login-password").fill("wasabi-dev-password");

page.on("request", (req) => {
  if (req.url().includes("/api/auth")) console.log("[request]", req.method(), req.url());
});
page.on("response", async (res) => {
  if (res.url().includes("/api/auth")) console.log("[response]", res.status(), res.url(), await res.text().catch(() => ""));
});

await page.getByTestId("login-submit").click();
await page.waitForTimeout(4000);
console.log("URL after submit:", page.url());

await browser.close();
