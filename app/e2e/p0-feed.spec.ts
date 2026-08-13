import { expect, test } from "@playwright/test";
import { createProject, gotoFeed, login, runCycle } from "./helpers";

test.describe.configure({ mode: "serial" });

// E2E-004: 日次サイクルがカードを生成する
test("E2E-004 the daily cycle generates cards for every enabled channel", async ({ page }) => {
  await login(page);
  const slug = await createProject(page, { name: "Cycle Test" });

  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-cycle").click();
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
    timeout: 120_000,
  });

  await gotoFeed(page, slug);
  for (const channel of ["X", "REDDIT", "SEO_GEO", "ARTICLE", "LAUNCH"]) {
    await expect(page.getByTestId(`card-${channel}`).first()).toBeVisible();
  }

  // quota どおり: Reddit と SEO/GEO は 2 件、他は 1 件
  await expect(page.getByTestId("card-REDDIT")).toHaveCount(2);
  await expect(page.getByTestId("card-SEO_GEO")).toHaveCount(2);
  await expect(page.getByTestId("card-X")).toHaveCount(1);

  // priority / difficulty / 品質スコア / 言語バッジ
  const first = page.getByTestId("card-X").first();
  await expect(first.getByTestId("card-priority")).toBeVisible();
  await expect(first.getByTestId("card-difficulty")).toBeVisible();
  await expect(first.getByTestId("card-quality")).toBeVisible();
  await expect(first.getByTestId("card-language")).toHaveText("en");

  // 各カードに rationale
  await first.click();
  await expect(page.getByTestId("card-rationale")).not.toBeEmpty();
});

// E2E-005 / E2E-006: Xカードの承認・投稿と編集の学習記録
test("E2E-005/006 an X card publishes, and a human edit is recorded as its own draft version", async ({
  page,
}) => {
  await login(page);
  const slug = await createProject(page, { name: "Publish Test" });
  await runCycle(page, slug);

  // X OAuth 接続済みにする
  await page.goto(`/projects/${slug}/integrations`);
  await page.getByTestId("connect-X_OAUTH").click();
  await expect(page.getByTestId("status-X_OAUTH")).toHaveText("CONNECTED");

  await gotoFeed(page, slug);
  const xCard = page.getByTestId("card-X").first();
  await xCard.click();

  // E2E-006: 本文を編集して保存
  const editor = page.getByTestId("draft-editor");
  await editor.fill("Edited by a human before posting.");
  await page.getByTestId("draft-save").click();
  await expect(page.getByTestId("draft-version")).toContainText("v2");
  await expect(page.getByTestId("draft-author")).toHaveText("HUMAN");

  // E2E-005: Post now
  await page.getByTestId("card-post").click();
  await expect(page.getByTestId("feed-toast")).toContainText(/published/i);

  await page.getByTestId("tab-PUBLISHED").click();
  const published = page.getByTestId("card-X").first();
  await expect(published).toBeVisible();
  await published.click();
  await expect(page.getByTestId("publish-url")).toHaveAttribute("href", /.+/);
  await expect(page.getByTestId("publish-method")).toHaveText("API_X");
  // 投稿は編集後の本文で行われる
  await expect(page.getByTestId("publish-body")).toContainText("Edited by a human before posting.");
});

// E2E-007: Redditカードの手動投稿フロー
test("E2E-007 a Reddit card is copy-and-mark-done only, with no auto-post control", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  const slug = await createProject(page, { name: "Reddit Test" });
  await runCycle(page, slug);

  await gotoFeed(page, slug);
  const redditCard = page.getByTestId("card-REDDIT").first();
  await redditCard.click();

  // 元スレッドembed + subredditルール要旨
  await expect(page.getByTestId("source-embed")).toBeVisible();
  await expect(page.getByTestId("subreddit-rules")).not.toBeEmpty();

  // BAN回避原則: 自動投稿ボタンがこの画面のどこにも存在しない
  await expect(page.getByTestId("card-post")).toHaveCount(0);

  await page.getByTestId("card-copy").click();
  await expect(page.getByTestId("mark-done-prompt")).toBeVisible();
  await page.getByTestId("external-url").fill("https://reddit.com/r/test/comments/abc/def");
  await page.getByTestId("mark-done-confirm").click();

  await expect(page.getByTestId("feed-toast")).toContainText(/done/i);
  await page.getByTestId("tab-DONE").click();
  await expect(page.getByTestId("card-REDDIT").first()).toBeVisible();
});

// E2E-014: カードのアーカイブ(理由付き)
test("E2E-014 archiving a card records the reason", async ({ page }) => {
  await login(page);
  const slug = await createProject(page, { name: "Archive Test" });
  await runCycle(page, slug);

  await gotoFeed(page, slug);
  await page.getByTestId("card-X").first().click();
  await page.getByTestId("card-archive").click();
  await page.getByTestId("archive-reason-off_voice").click();
  await page.getByTestId("archive-confirm").click();

  await page.getByTestId("tab-ARCHIVED").click();
  const archived = page.getByTestId("card-X").first();
  await expect(archived).toBeVisible();
  await archived.click();
  await expect(page.getByTestId("archive-reason")).toHaveText("off_voice");
});

// E2E-015: ローンチカード(HN/Product Hunt)
test("E2E-015 the launch card offers variants, timing guidance, and no hype words", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  const slug = await createProject(page, { name: "Launch Test", phase: "prelaunch" });
  await runCycle(page, slug);

  await gotoFeed(page, slug);
  const launchCard = page.getByTestId("card-LAUNCH").first();
  await launchCard.click();

  await expect(page.getByTestId("launch-variants")).toBeVisible();
  await expect(page.getByTestId("launch-variant")).toHaveCount(3);
  await expect(page.getByTestId("launch-timing")).not.toBeEmpty();

  const body = (await page.getByTestId("draft-editor").inputValue()).toLowerCase();
  for (const hype of ["revolutionary", "game-changing", "ai-powered"]) {
    expect(body).not.toContain(hype);
  }

  await page.getByTestId("card-copy").click();
  await page.getByTestId("external-url").fill("https://news.ycombinator.com/item?id=1");
  await page.getByTestId("mark-done-confirm").click();
  await page.getByTestId("tab-DONE").click();
  await expect(page.getByTestId("card-LAUNCH").first()).toBeVisible();
});
