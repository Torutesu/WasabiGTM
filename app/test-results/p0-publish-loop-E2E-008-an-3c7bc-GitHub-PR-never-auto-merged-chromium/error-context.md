# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p0-publish-loop.spec.ts >> E2E-008 an SEO issue becomes a card and then a GitHub PR, never auto-merged
- Location: e2e/p0-publish-loop.spec.ts:7:5

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByTestId('pr-url')
Expected pattern: /github/
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 15000ms
  - waiting for getByTestId('pr-url')

```

```yaml
- banner:
  - link "Wasabi":
    - /url: /
  - combobox "Switch project":
    - option "SEO Test" [selected]
    - option "Launch Test"
    - option "Archive Test"
    - option "Reddit Test"
    - option "Publish Test"
    - option "Cycle Test"
    - option "Voice Test"
    - option "Shogun Test"
    - option "+ New project…"
  - text: founder@wasabi.local
  - link "Sign out":
    - /url: /api/auth/signout
- navigation:
  - list:
    - listitem:
      - link "Activity":
        - /url: /projects/seo-test
    - listitem:
      - link "Feed":
        - /url: /projects/seo-test/feed
    - listitem:
      - link "Chat":
        - /url: /projects/seo-test/chat
    - listitem:
      - link "Context":
        - /url: /projects/seo-test/docs
    - listitem:
      - link "Site health":
        - /url: /projects/seo-test/site
    - listitem:
      - link "Performance":
        - /url: /projects/seo-test/performance
    - listitem:
      - link "Integrations":
        - /url: /projects/seo-test/integrations
    - listitem:
      - link "Settings":
        - /url: /projects/seo-test/settings
- main:
  - button "Current"
  - button "Done"
  - button "Published"
  - button "Archived"
  - combobox "Filter by channel":
    - option "All channels" [selected]
    - option "X"
    - option "REDDIT"
    - option "SEO_GEO"
    - option "ARTICLE"
    - option "LAUNCH"
  - combobox "Filter by language":
    - option "All languages" [selected]
    - option "en"
  - paragraph: Nothing waiting. The next cycle will fill this in — or run one from Activity.
- alert
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { createProject, gotoFeed, login, runCycle } from "./helpers";
  3   | 
  4   | test.describe.configure({ mode: "serial" });
  5   | 
  6   | // E2E-008: SEO fix → GitHub PR
  7   | test("E2E-008 an SEO issue becomes a card and then a GitHub PR, never auto-merged", async ({
  8   |   page,
  9   | }) => {
  10  |   await login(page);
  11  |   const slug = await createProject(page, { name: "SEO Test" });
  12  | 
  13  |   await page.goto(`/projects/${slug}/integrations`);
  14  |   await page.getByTestId("connect-GITHUB_APP").click();
  15  |   await expect(page.getByTestId("status-GITHUB_APP")).toHaveText("CONNECTED");
  16  | 
  17  |   await page.goto(`/projects/${slug}/site`);
  18  |   await page.getByTestId("run-audit").click();
  19  |   await expect(page.getByTestId("audit-score")).toBeVisible({ timeout: 120_000 });
  20  | 
  21  |   const issue = page.getByTestId("issue-row").filter({ hasText: "llms.txt" }).first();
  22  |   await expect(issue).toBeVisible();
  23  |   await issue.getByTestId("create-fix").click();
  24  |   await expect(page.getByTestId("site-toast")).toContainText(/added to feed/i);
  25  | 
  26  |   await gotoFeed(page, slug);
  27  |   const fixCard = page.getByTestId("card-SEO_GEO").filter({ hasText: "llms.txt" }).first();
  28  |   await fixCard.click();
  29  |   await expect(page.getByTestId("fix-diff")).toBeVisible();
  30  | 
  31  |   await page.getByTestId("card-create-pr").click();
  32  |   await expect(page.getByTestId("feed-toast")).toContainText(/pull request/i);
> 33  |   await expect(page.getByTestId("pr-url")).toHaveAttribute("href", /github/);
      |                                            ^ Error: expect(locator).toHaveAttribute(expected) failed
  34  |   // 自動マージは行われない
  35  |   await expect(page.getByTestId("pr-merged")).toHaveCount(0);
  36  | 
  37  |   await page.getByTestId("tab-PUBLISHED").click();
  38  |   await expect(page.getByTestId("card-SEO_GEO").first()).toBeVisible();
  39  | });
  40  | 
  41  | // E2E-009: 記事カード→CMS公開
  42  | test("E2E-009 an article publishes to CMS when configured and exports only when not", async ({
  43  |   page,
  44  | }) => {
  45  |   await login(page);
  46  |   const slug = await createProject(page, { name: "Article Test" });
  47  |   await runCycle(page, slug);
  48  | 
  49  |   // CMS未設定のときは Publish が出ず Export のみ
  50  |   await gotoFeed(page, slug);
  51  |   await page.getByTestId("card-ARTICLE").first().click();
  52  |   await expect(page.getByTestId("card-export")).toBeVisible();
  53  |   await expect(page.getByTestId("card-publish-cms")).toHaveCount(0);
  54  | 
  55  |   // 記事は 800 語以上・targetKeyword 付き
  56  |   const body = await page.getByTestId("draft-editor").inputValue();
  57  |   expect(body.length).toBeGreaterThan(400);
  58  |   await expect(page.getByTestId("target-keyword")).not.toBeEmpty();
  59  | 
  60  |   // CMS を設定
  61  |   await page.goto(`/projects/${slug}/integrations`);
  62  |   await page.getByTestId("configure-CMS_WEBHOOK").click();
  63  |   await page.getByTestId("cms-webhook-url").fill("https://cms.example.com/hooks/posts");
  64  |   await page.getByTestId("cms-secret").fill("shhh");
  65  |   await page.getByTestId("cms-save").click();
  66  |   await expect(page.getByTestId("status-CMS_WEBHOOK")).toHaveText("CONNECTED");
  67  | 
  68  |   await gotoFeed(page, slug);
  69  |   await page.getByTestId("card-ARTICLE").first().click();
  70  |   await page.getByTestId("card-publish-cms").click();
  71  |   await expect(page.getByTestId("feed-toast")).toContainText(/published/i);
  72  | 
  73  |   await page.getByTestId("tab-PUBLISHED").click();
  74  |   await page.getByTestId("card-ARTICLE").first().click();
  75  |   await expect(page.getByTestId("publish-method")).toHaveText("CMS");
  76  |   // fieldMapping どおりに title/body/slug/og が送信された
  77  |   await expect(page.getByTestId("cms-payload")).toContainText("title");
  78  |   await expect(page.getByTestId("cms-payload")).toContainText("slug");
  79  | });
  80  | 
  81  | // E2E-010: 品質ゲートが低品質ドラフトを止める
  82  | test("E2E-010 the quality gate rewrites weak drafts and drops the ones that never pass", async ({
  83  |   page,
  84  | }) => {
  85  |   await login(page);
  86  |   const slug = await createProject(page, { name: "Quality Test" });
  87  | 
  88  |   // テスト用シード: 品質ゲートを必ず落とすモードにする
  89  |   await page.goto(`/projects/${slug}/settings`);
  90  |   await page.getByTestId("agent-X-instructions").fill("__TEST_FORCE_QUALITY_FAIL__");
  91  |   await page.getByTestId("settings-save").click();
  92  |   await expect(page.getByTestId("settings-toast")).toBeVisible();
  93  | 
  94  |   await page.goto(`/projects/${slug}`);
  95  |   await page.getByTestId("run-cycle").click();
  96  |   await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
  97  |     timeout: 120_000,
  98  |   });
  99  | 
  100 |   // 3回連続不合格 → カードはフィードに出ず、Activityに記録される
  101 |   await gotoFeed(page, slug);
  102 |   await expect(page.getByTestId("card-X")).toHaveCount(0);
  103 | 
  104 |   await page.goto(`/projects/${slug}`);
  105 |   await expect(page.getByTestId("activity-log")).toContainText(/dropped \(quality\)/i);
  106 | 
  107 |   // 通常モードでは合格版のみがフィードに出る
  108 |   await page.goto(`/projects/${slug}/settings`);
  109 |   await page.getByTestId("agent-X-instructions").fill("");
  110 |   await page.getByTestId("settings-save").click();
  111 |   await page.goto(`/projects/${slug}`);
  112 |   await page.getByTestId("run-cycle").click();
  113 |   await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS", {
  114 |     timeout: 120_000,
  115 |   });
  116 | 
  117 |   await gotoFeed(page, slug);
  118 |   const xCard = page.getByTestId("card-X").first();
  119 |   await expect(xCard).toBeVisible();
  120 |   await expect(xCard.getByTestId("card-quality")).toContainText(/\d+/);
  121 | });
  122 | 
  123 | // E2E-011: UTM付与と成果表示
  124 | test("E2E-011 published links carry a UTM and roll up into the performance funnel", async ({
  125 |   page,
  126 | }) => {
  127 |   await login(page);
  128 |   const slug = await createProject(page, { name: "Metrics Test" });
  129 |   await runCycle(page, slug);
  130 | 
  131 |   await page.goto(`/projects/${slug}/integrations`);
  132 |   await page.getByTestId("configure-CMS_WEBHOOK").click();
  133 |   await page.getByTestId("cms-webhook-url").fill("https://cms.example.com/hooks/posts");
```