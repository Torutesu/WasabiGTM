import { expect, test } from "@playwright/test";
import { CREDENTIALS, MOCK_SITE_URL, createProject, login } from "./helpers";

test.describe.configure({ mode: "serial" });

// E2E-001: ログイン
test("E2E-001 login succeeds with valid credentials and rejects bad ones", async ({ page }) => {
  // 1. Given 未認証ユーザーが / にアクセスする
  await page.goto("/");
  // 2. When /login にリダイレクトされ、正しいemail/passwordを入力してSign inを押す
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId("login-email").fill(CREDENTIALS.email);
  await page.getByTestId("login-password").fill(CREDENTIALS.password);
  await page.getByTestId("login-submit").click();
  // 3. Then ダッシュボード(またはプロジェクト未作成なら /projects/new)に遷移する
  await expect(page).toHaveURL(/\/projects\/new|\/projects\/[^/]+$/);

  // 4. When 誤ったパスワードで再試行する
  await page.goto("/api/auth/signout");
  await page.goto("/login");
  await page.getByTestId("login-email").fill(CREDENTIALS.email);
  await page.getByTestId("login-password").fill("wrong-password");
  await page.getByTestId("login-submit").click();
  // 5. Then 「Invalid email or password」が表示され、遷移しない
  await expect(page.getByTestId("login-error")).toHaveText(/Invalid email or password/);
  await expect(page).toHaveURL(/\/login/);
});

// E2E-002: プロジェクト作成→解析→Foundation Docs生成
test("E2E-002 onboarding analyses the site and generates all five foundation docs", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Shogun Test", languages: ["en", "ja"] });

  await page.goto(`/projects/${slug}/docs`);
  const kinds = [
    "PRODUCT_DESCRIPTION",
    "PRODUCT_INFO",
    "MARKETING_STRATEGY",
    "COMPETITOR_ANALYSIS",
    "BRAND_VOICE",
  ];
  for (const kind of kinds) {
    await page.getByTestId(`doc-tab-${kind}`).click();
    const editor = page.getByTestId("doc-editor");
    await expect(editor).toBeVisible();
    await expect(editor).not.toHaveValue("");
  }

  // 内容にモックサイトの固有情報(製品名・価格)が含まれる
  await page.getByTestId("doc-tab-PRODUCT_INFO").click();
  const productInfo = await page.getByTestId("doc-editor").inputValue();
  expect(productInfo).toContain("Shogun Test");
  expect(productInfo).toContain("$62");

  await expect(page.getByTestId("source-row-WEBSITE")).toContainText(MOCK_SITE_URL);
});

// E2E-003: Foundation Doc編集が次サイクルに反映される
test("E2E-003 editing brand voice suppresses the banned word in the next cycle", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Voice Test" });

  await page.goto(`/projects/${slug}/docs`);
  await page.getByTestId("doc-tab-BRAND_VOICE").click();
  const editor = page.getByTestId("doc-editor");
  const before = await editor.inputValue();
  await editor.fill(`${before}\n\n## Never use\n- revolutionary\n`);
  await page.getByTestId("doc-save").click();

  await expect(page.getByTestId("doc-toast")).toContainText(/next generation cycle/i);
  await expect(page.getByTestId("doc-version")).toContainText("v2");

  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-cycle").click();
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  await page.goto(`/projects/${slug}/feed`);
  const xCard = page.getByTestId("card-X").first();
  await xCard.click();
  const body = await page.getByTestId("draft-editor").inputValue();
  expect(body.toLowerCase()).not.toContain("revolutionary");
});
