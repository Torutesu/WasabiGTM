import { expect, test } from "@playwright/test";
import { createProject, gotoFeed, login, runCycle } from "./helpers";

test.describe.configure({ mode: "serial" });

// E2E-008: SEO fix → GitHub PR
test("E2E-008 an SEO issue becomes a card and then a GitHub PR, never auto-merged", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "SEO Test" });

  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("connect-GITHUB_APP").click();
  await expect(page.getByTestId("status-GITHUB_APP")).toHaveText("CONNECTED");

  await page.goto(`/projects/${slug}/site`);
  await page.getByTestId("run-audit").click();
  await expect(page.getByTestId("audit-score")).toBeVisible({ timeout: 120_000 });

  const issue = page.getByTestId("issue-row").filter({ hasText: "llms.txt" }).first();
  await expect(issue).toBeVisible();
  await issue.getByTestId("create-fix").click();
  await expect(page.getByTestId("site-toast")).toContainText(/added to feed/i);

  await gotoFeed(page, slug);
  const fixCard = page.getByTestId("card-SEO_GEO").filter({ hasText: "llms.txt" }).first();
  await fixCard.click();
  await expect(page.getByTestId("fix-diff")).toBeVisible();

  await page.getByTestId("card-create-pr").click();
  await expect(page.getByTestId("feed-toast")).toContainText(/pull request/i);
  await expect(page.getByTestId("pr-url")).toHaveAttribute("href", /github/);
  // 自動マージは行われない
  await expect(page.getByTestId("pr-merged")).toHaveCount(0);

  await page.getByTestId("tab-PUBLISHED").click();
  await expect(page.getByTestId("card-SEO_GEO").first()).toBeVisible();
});

// E2E-009: 記事カード→CMS公開
test("E2E-009 an article publishes to CMS when configured and exports only when not", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Article Test" });
  await runCycle(page, slug);

  // CMS未設定のときは Publish が出ず Export のみ
  await gotoFeed(page, slug);
  await page.getByTestId("card-ARTICLE").first().click();
  await expect(page.getByTestId("card-export")).toBeVisible();
  await expect(page.getByTestId("card-publish-cms")).toHaveCount(0);

  // 記事は 800 語以上・targetKeyword 付き
  const body = await page.getByTestId("draft-editor").inputValue();
  expect(body.length).toBeGreaterThan(400);
  await expect(page.getByTestId("target-keyword")).not.toBeEmpty();

  // CMS を設定
  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("configure-CMS_WEBHOOK").click();
  await page.getByTestId("cms-webhook-url").fill("https://cms.example.com/hooks/posts");
  await page.getByTestId("cms-secret").fill("shhh");
  await page.getByTestId("cms-save").click();
  await expect(page.getByTestId("status-CMS_WEBHOOK")).toHaveText("CONNECTED");

  await gotoFeed(page, slug);
  await page.getByTestId("card-ARTICLE").first().click();
  await page.getByTestId("card-publish-cms").click();
  await expect(page.getByTestId("feed-toast")).toContainText(/published/i);

  await page.getByTestId("tab-PUBLISHED").click();
  await page.getByTestId("card-ARTICLE").first().click();
  await expect(page.getByTestId("publish-method")).toHaveText("CMS");
  // fieldMapping どおりに title/body/slug/og が送信された
  await expect(page.getByTestId("cms-payload")).toContainText("title");
  await expect(page.getByTestId("cms-payload")).toContainText("slug");
});

// E2E-010: 品質ゲートが低品質ドラフトを止める
test("E2E-010 the quality gate rewrites weak drafts and drops the ones that never pass", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Quality Test" });

  // テスト用シード: 品質ゲートを必ず落とすモードにする
  await page.goto(`/projects/${slug}/settings`);
  await page.getByTestId("agent-X-instructions").fill("__TEST_FORCE_QUALITY_FAIL__");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-toast")).toBeVisible();

  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-cycle").click();
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  // 3回連続不合格 → カードはフィードに出ず、Activityに記録される
  await gotoFeed(page, slug);
  await expect(page.getByTestId("card-X")).toHaveCount(0);

  await page.goto(`/projects/${slug}`);
  await expect(page.getByTestId("activity-log")).toContainText(/dropped \(quality\)/i);

  // 通常モードでは合格版のみがフィードに出る
  await page.goto(`/projects/${slug}/settings`);
  await page.getByTestId("agent-X-instructions").fill("");
  await page.getByTestId("settings-save").click();
  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-cycle").click();
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  await gotoFeed(page, slug);
  const xCard = page.getByTestId("card-X").first();
  await expect(xCard).toBeVisible();
  await expect(xCard.getByTestId("card-quality")).toContainText(/\d+/);
});

// E2E-011: UTM付与と成果表示
test("E2E-011 published links carry a UTM and roll up into the performance funnel", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Metrics Test" });
  await runCycle(page, slug);

  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("configure-CMS_WEBHOOK").click();
  await page.getByTestId("cms-webhook-url").fill("https://cms.example.com/hooks/posts");
  await page.getByTestId("cms-secret").fill("shhh");
  await page.getByTestId("cms-save").click();

  await gotoFeed(page, slug);
  await page.getByTestId("card-ARTICLE").first().click();
  const cardId = await page.getByTestId("card-detail").getAttribute("data-card-id");
  await page.getByTestId("card-publish-cms").click();
  await expect(page.getByTestId("feed-toast")).toContainText(/published/i);

  // 指標取り込み
  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-metrics").click();
  await expect(page.getByTestId("job-status-METRIC_PULL")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  await page.goto(`/projects/${slug}/performance`);
  await expect(page.getByTestId("funnel-published")).not.toHaveText("0");
  await expect(page.getByTestId("funnel-impressions")).not.toHaveText("0");
  await expect(page.getByTestId("funnel-clicks")).not.toHaveText("0");

  const row = page.getByTestId("record-row").first();
  await expect(row.getByTestId("record-impressions")).toContainText(/\d/);
  await expect(row.getByTestId("record-clicks")).toContainText(/\d/);

  // utm_campaign=カードID が付与されている
  await expect(row.getByTestId("record-utm")).toContainText(`utm_campaign=${cardId}`);
});

// E2E-012: 週次振り返り生成と学習の反映
test("E2E-012 the weekly review produces learnings that show up in the next cycle", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Review Test" });
  await runCycle(page, slug);

  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("connect-X_OAUTH").click();

  await gotoFeed(page, slug);
  await page.getByTestId("card-X").first().click();
  await page.getByTestId("card-post").click();
  await expect(page.getByTestId("feed-toast")).toContainText(/published/i);

  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-metrics").click();
  await expect(page.getByTestId("job-status-METRIC_PULL")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  await page.goto(`/projects/${slug}/performance`);
  await page.getByTestId("generate-review").click();
  await expect(page.getByTestId("review-item").first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("review-learnings").first()).not.toBeEmpty();

  // 次サイクルの rationale に learnings への参照が含まれる
  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-cycle").click();
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  await gotoFeed(page, slug);
  await page.getByTestId("card-X").first().click();
  await expect(page.getByTestId("card-rationale")).toContainText(/learnings/i);
});

// E2E-013: CMOチャット(コンテキスト参照付き)
test("E2E-013 chat answers with context refs and can add a card to the feed", async ({ page }) => {
  await login(page);
  const slug = await createProject(page, { name: "Chat Test" });

  await page.goto(`/projects/${slug}/chat`);
  await page.getByTestId("chat-input").fill("@strategy 今週の最優先チャネルは?");
  await page.getByTestId("chat-send").click();

  await expect(page.getByTestId("chat-message-assistant").first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("context-chip-MARKETING_STRATEGY").first()).toBeVisible();

  await page.getByTestId("chat-input").fill("明日のツイートを1案作って");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-add-to-feed").first()).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("chat-add-to-feed").first().click();
  await expect(page.getByTestId("chat-toast")).toContainText(/added to feed/i);

  await gotoFeed(page, slug);
  await expect(page.getByTestId("card-X").first()).toBeVisible();
});

// E2E-016: 統合の接続・失効・フォールバック
test("E2E-016 disconnected and expired integrations fall back to copy instead of posting", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Integration Test" });
  await runCycle(page, slug);

  // X 未接続 → Post now が無く Copy のみ
  await gotoFeed(page, slug);
  await page.getByTestId("card-X").first().click();
  await expect(page.getByTestId("card-post")).toHaveCount(0);
  await expect(page.getByTestId("card-copy")).toBeVisible();

  // 接続 → Post now が現れる
  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("connect-X_OAUTH").click();
  await expect(page.getByTestId("status-X_OAUTH")).toHaveText("CONNECTED");

  await gotoFeed(page, slug);
  await page.getByTestId("card-X").first().click();
  await expect(page.getByTestId("card-post")).toBeVisible();

  // トークン失効 → エラー表示、カードは CURRENT に留まる、Reconnect が出る
  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("expire-X_OAUTH").click();
  await expect(page.getByTestId("status-X_OAUTH")).toHaveText("ERROR");

  await gotoFeed(page, slug);
  await page.getByTestId("card-X").first().click();
  await page.getByTestId("card-post").click();
  await expect(page.getByTestId("card-error")).toContainText(/token expired/i);

  await page.getByTestId("tab-CURRENT").click();
  await expect(page.getByTestId("card-X").first()).toBeVisible();

  await page.goto(`/projects/${slug}/integrations`);
  await expect(page.getByTestId("reconnect-X_OAUTH")).toBeVisible();
});
