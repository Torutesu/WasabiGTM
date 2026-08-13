# Research: Okara プロダクト深掘り (docs / pricing / changelog) (2026-08-13)

> Stage 1 リサーチ生データ (調査エージェント出力)。teardown.md の入力資料。
> 主要ソース: docs全ページ(`okara.ai/docs/llms.txt` 経由で全docsが.md取得可能)、`/api/changelog`(生JSON 96エントリ)、pricing/homepageの生HTML(アプリのi18n文字列埋め込み=画面インベントリの一次情報)、`/subprocessors`、各agentページ、blog。約40の一次ソース。

## 1. 機能詳細(エージェント別)

全体構造: 1つの「AI CMO」の下に10のチャネル特化エージェント。**基本パターンは「エージェントが毎日自動でスキャン→ドラフト生成→Agents Feedにカード投入→人間が承認/編集/実行」**。自動実行(auto-publish)はCMS記事とX/LinkedIn投稿のみオプトイン。Redditは常に手動。

有料プランの日次デリバリー約束(CMO初回メッセージ原文、i18nより確定): 「every day i'll send you: 2 seo/geo issues to fix, 1 written article, 2 reddit opportunities, 1 tweet, 1 linkedin post (coming soon)」

### SEO Agent(Free/Paid)
- Freeはホームページのみ監査、Paidは「full sub-page audit every day」(サイトマップ全ページ)
- 日次監査4カテゴリ: ①on-pageフィックス(meta欠落、弱いH1等) ②キーワードギャップ ③コンテンツ機会 ④Core Web Vitals+サイトファイル(robots.txt/sitemap.xml/llms.txt。llms.txt自動生成可)
- 実行3経路: (a) WordPress/Webflow接続時「Fix」ボタンで直接適用 (b) GitHub接続時はCoding AgentがPR作成 (c) 手動手順提示。「Fixes are not applied automatically」(FAQ明記)

### GEO Agent(Paid)
- 対象: ChatGPT / Perplexity / Google AI(Gemini) / Claude の4エンジン
- GEOスコア(0-100)、AI Readinessチェックリスト(llms.txt、robots.txt、sitemap、schema)、競合GEO比較、AIキーワード、「Top Prompts」(引用されるべきなのにされていない購買意図クエリ)
- 日次2件のGEO fix(問題+推奨+コピペ可能コード+期待効果)。brand sentiment分析、週次スコア推移

### Reddit Agent(Paid)
- subreddit群を日次スキャン、ブランド/競合/製品キーワード監視。関連性フィルタ(「製品が自然に問題を解決するスレッドのみ」)。subredditの文化・ルールサマリも生成
- カード=スレッド詳細+関連性説明+コミュニティ調ドラフト返信(「質問にまず答える。製品言及は自然に・最小限・または無し」)
- **完全手動のみ**。「Nothing goes live without your say-so」— BAN回避設計が明示的ポジショニング

### X Agent(Free/Paid)
- 日次ツイートドラフト(5カテゴリローテ: 製品ポジショニング/業界観察/エンゲージメント質問/トレンド反応/コンテンツ宣伝)+スレッド
- コピペ手動 or OAuth接続「Post」で即時投稿。**各ドラフトは独立生成(編集内容は次の生成に影響しない、と明記)**
- changelog 1.54.31 (2026-04-09)で「removed autoPoster feature for X」→ スケジュール自動投稿は現在無い可能性が高い [ASSUMED]

### LinkedIn Agent(Paid)
- founder-voice投稿カード(完成ドラフト+angle説明)。5タイプローテ(behind-the-scenes/構築の学び/業界観察・逆張り/マイルストーン/顧客ストーリー)
- 個人プロフィールがデフォルト、会社ページも選択可

### Articles Writer Agent(Paid)
- コンテンツロードマップに基づきキーワードギャップ+AI引用機会からトピック選定。6記事タイプ(SEO/Thought Leadership/How-To/Comparison/Case Study/Listicle)
- Markdown完全ドラフト(800–2,000語)、ターゲットキーワード、生成OG画像付き
- 生成パイプライン(i18nで確定): 「Writing article... → **Humanizing content...** → Polishing for authenticity...」— AI検出対策のhumanizer後処理工程が存在。`/tools/ai-humanizer` を無料公開ツールとして保有
- WordPress/Webflow/Framer(+Sanity)へ自動公開(Published即公開 or Draft選択可)

### Hacker News Agent(Paid)
- Show HN/Ask HNの3バリエーション(技術的課題軸/ユーザー成果軸/独自性軸)。タイトル+本文80–150語。「'revolutionary','game-changing','AI-powered'等のハイプ語禁止」ルール
- docsでは手動提出のみ。agentマーケページは「One-Click Submission」を謳い矛盾 → マーケ誇張の可能性 [ASSUMED]。推奨投稿時刻(火〜木 US東部朝)ガイダンス付き

### UGC Video Agent(Paid)
- チャット内ワークフロー: 自然言語依頼(参照画像添付可)→ドラフトカード→アスペクト比(9:16/16:9/1:1)・解像度(最大720p)・長さ・音声設定→クレジットコスト事前表示→生成(最大10分、ライブ状態表示)→MP4ダウンロード
- 例: 12秒720p TikTokクリップ=96クレジット。プロンプト記述型(アバターライブラリ選択ではない)

### Coding Agent(Paid)
- SEO/GEO監査の指摘(structured data欠落、llms.txt不在、meta不足、canonical等)を自動ピックアップ→接続リポジトリの関連ファイルを読み、リポ構造に合わせたコード生成
- **GitHub PR**(変更理由のインライン説明付き)。「Nothing is merged automatically」。1プロジェクト1リポジトリ制限
- 差別化主張: OTTO/Alli AI等のJSインジェクション型と違い「real code in your codebase with full git history」

### Influencer Agent(Paid)
- フロー: ①CMOチャットで目標/予算/期間/成果物ヒアリング→ブリーフ ②クリエイタープールから5軸スコアリング(リーチ/バーティカル適合/トーン/信頼性/予算適合)→ショートリストを**ユーザー承認** ③**Stripe Checkoutで前払いファンディング** ④一斉アウトリーチ、**48時間受諾期限**、未受諾分は自動返金 ⑤提出物トラッキング(Accepted/Submitted/Changes Requested/Approved/Declined)。未対応提出物はキャンペーン終了48時間後に自動承認 ⑥承認後自動ペイアウト
- 手数料: キャンペーン総額の**10%コミッション**(返金不可)。クリエイター1,000人以上、**現在X/Twitterのみ**(IG/TikTok/YouTube「Soon」)

## 2. オンボーディングフロー

1. URL入力(サインアップ)
2. 自動解析: homepage・pricing・sitemap経由の公開ページをクロール(ログイン/ペイウォール裏はアクセスしない)。ターミナル演出でライブ進捗(「$ Initializing AI CMO...」「✓ Documents loaded and CMO initialized」)
3. 所要: Free 3–5分、Paid 5–8分。失敗時は最大3回自動リトライ
4. ダッシュボード稼働: Company / Analytics / Agents Feed / Talk to AI CMO の4パネル。統合は後付けオプション
5. アップグレード時: 「Upgrade detected — generating remaining content...」→競合分析・ブランドボイス等を追加生成(再セットアップ不要)

**Foundation documents(5つ)**: ①Product Description ②Product Information ③Marketing Strategy(チャネル・メッセージング優先度・初期フォーカス) ④Competitor Analysis(Paid) ⑤Brand Voice(Paid。トーン/スタイル/使う語・避ける語/例文。全生成物がこれに従う)。全て直接編集可、保存即反映(既存カードは不変、次の**6時間サイクル**以降の新規生成から反映)。

**Website Refresh**: サイト再読取→意味的変化があれば文書再生成(手動は24時間に1回、2–4分。バックグラウンド自動検知もあり)。

## 3. 画面インベントリ(★=一次情報で確定)

| 画面 | 目的 | 主要UI要素(確認できたもの) |
|---|---|---|
| ★オンボーディング(URL入力) | 起点 | URL入力、「Get started free · No credit card required」 |
| ★AI CMO Terminal | エージェント活動リアルタイムログ | タイムスタンプ付きストリーム、トグル、Refresh、「New report available」、プロジェクトスイッチャー |
| ★Company パネル | 製品プロフィール+5文書 | 編集フォーム、文書ごとに Save/Download/Copy/Undo、翻訳、Sync from website |
| ★Analytics — SEO | 検索健全性 | ヘルススコア0-100、CWV(FCP/LCP/CLS/TBT、mobile/desktop)、meta品質、Issueリスト+Fixボタン、tracked sub-pages |
| ★Analytics — Links(Paid) | 被リンク | 総リンク/参照ドメイン/スパムスコア、健全性4階層、上位参照ドメイン、TLD分布 |
| ★Analytics — GEO(Paid) | AI可視性 | GEOスコア、AI Readinessチェックリスト、競合比較、Top Prompts、Most-Cited Pages、AI Keyword Volumes |
| ★Analytics — Technical | 技術監査 | TTFB/DOMLoaded/PageLoad/PageSize、render-blocking、OG/Twitter Card検証、見出し構造 |
| ★Analytics — Traffic | GA/GSC | セッション推移、users、pageviews、clicks/impressions/CTR/平均掲載順位、top pages/queries。1日3回同期(9am/2pm/7pm) |
| ★Agents Feed | 日次機会キュー(中核画面) | Current/Archivedタブ。9種カード。展開で Post/Copy/Publish/Mark as done/Archive。難易度(Easy/Medium/Hard)・優先度(High/Medium/Low)バッジ。Writing Instructions(エージェント別トーン・キーワード・地域・優先コミュニティ) |
| ★Talk to AI CMO(チャット) | 対話・生成ハブ | 「Ask me anything…」、添付、@メンション/コンテキストピル(Company/Reddit/SEO&GEO/X Writer/Articles/HN/LinkedIn/GSC/GA/Influencer)、Chain of Thoughtトグル、履歴、毎朝のdaily rundown自動投下、UGC動画作成もここから |
| ★Settings | 設定 | AI CMO / Websites / Credits / Agents / Integrations / Team / Chat / Personalization / General / Account & Security / Devices / Subscription |
| ★Settings — Team(Paid) | 招待管理 | メール招待(7日有効)、Admin/Member、シート課金($20/mo) |
| ★Integrations パネル | 統合管理 | Connect/Connected/Disconnect/Reconnect/Coming soon、Auto-publish articlesトグル、Field mapping settings(自由記述でCMSフィールド割当) |
| ★課金モーダル | アップグレード | 「Hire your full-time CMO」、$99(取り消し線$129)/month、Monthly/Yearly |
| ★クレジットUI | 残高管理 | 残高、20%で低残高警告、Top up/Upgrade、0でエージェント一時停止 |
| ★ユーザーメニュー | グローバル | Credits/Theme/Language(**17言語**)/Integrations/Add Team Member $20/mo/Add Website $99/mo/Invite Friends & Earn Money/Docs |
| ★接続モーダル群 | 外部チャット接続 | Telegram(コード10分期限)、WhatsApp(電話番号+認証コード)、**Slack(i18nに完全実装済みフロー、マーケサイトでは「Soon」)** |
| Influencerキャンペーン画面 | 進行管理 | ブリーフ、ショートリスト承認、Stripe Checkout、提出物ステータス表 [ASSUMED: チャット内カード+専用ビュー複合] |
| 共有ダッシュボード | 読み取り専用リンク | 投資家/顧問向けread-only(docsで確定) |

## 4. 料金(時点別、すべて一次ソース)

| 時点 | 内容 |
|---|---|
| 2026-04-06(blog) | $249/mo、$2,490/yr。全エージェント込み |
| 2026-05-26(blog) | Free(20cr、SEOのみ)/ Lite $129/mo($107.50年払)/ Pro $249/mo($207.50年払、2,000cr、全エージェント) |
| 2026-08(実測) | JSON-LD: Free 5cr +「AI CMO plan: $129/month or $107.50/month annually. 2,000 credits(~20,000 messages)」。課金モーダル: **$99/month(取り消し線$129)**。pricingページ「From $99/mo」 |

- [ASSUMED] 現行は実質1有料プラン($129定価→$99プロモ)。Lite/Pro 2階層は統合/縮退か。docs/plans.mdもFree/Paidの2区分のみ
- アドオン(確定): 追加ウェブサイト **$99/mo/サイト**、追加チームメンバー **$20/mo/席**
- クレジット消費単価(docs/credits.md 確定): 記事18 / SEO・GEO分析10 / Website Refresh 10 / HN投稿9 / Redditスレッド+返信8 / LinkedIn 7 / X 5 / 記事画像5 / **UGC動画60**(12秒720p=96の例も) / チャットはメッセージ長変動
- 月2,000cr(繰越なし)。トップアップ(無期限): 860cr=$45 / 2,000cr=$90 / 4,600cr=$180
- 残高20%で警告、0で日次実行停止。Influencerは別途キャンペーン額10%
- 4ヶ月で3回の価格変更 = 価格実験中

## 5. 統合(11+3)

| 統合 | 認証 | 動作 |
|---|---|---|
| WordPress(.com) | OAuth | auto-publish。Yoast/RankMathフォーカスKW+OG画像featured+カテゴリ。即時公開 or 下書き |
| WordPress(self-hosted) | Application Password | 同上 |
| Webflow | OAuth | サイト+CMSコレクション選択、フィールドマッピング。SEO Fixes直接適用も対応 |
| Framer | OAuth | プロジェクト+CMSコレクション。title/slug/SEOメタ/OG自動設定 |
| Sanity | [ASSUMED: API token] | blog言及のみ。docs未整備 |
| X | OAuth | 投稿権限のみ。Postボタン即時、手動トリガーのみ |
| LinkedIn | OAuth | 投稿作成のみ。個人 or 会社ページ |
| GitHub | GitHub App | 1プロジェクト1リポ。Coding AgentがPR。自動マージなし |
| Google Analytics / GSC | OAuth | 1日3回同期 |
| WhatsApp / Telegram | 電話番号 / ボットコード | AI CMOと双方向チャット、ダイジェスト配信。履歴はダッシュボードread-only |
| Slack | OAuth | i18nに実装済みフロー。「Soon」表示 — リリース間近 [ASSUMED] |
| TikTok / Instagram | — | 「Soon」(クリップ公開用) |

## 6. 技術スタック手がかり

**確定(/subprocessors 2025-10-27時点)**:
- AWS(Singapore+US)/ Vercel / **Replicate(AI推論 — OpenAI/Anthropicはsubprocessor表に無い)** / Supabase(Postgres) / **Upstash(Redis+ベクターDB+メッセージキュー)** / Stripe / Resend / ConvertKit / Rewardful / PostHog / Crisp / Sanity(blog)
- Next.js(App Router)。i18n全文字列クライアント埋め込み(17言語)
- リポジトリ露出: github.com/tryagentsea/**bti-chat**(changelog JSONがGitHubリリース自動生成でコミットURL露出。チャットアプリ起源)。法人: Okara Technologies, Inc.

**モデル**: 旧チャット製品期のchangelogにMiniMax、Qwen3-VL、Kimi K2、gpt-oss-20b、DeepSeek、GPT-5→5.1。「オープンソースAIモデル特化にリブランド」(2025-11-05)。Replicate採用と合わせ、**AI CMOの生成もオープンウェイト系中心の可能性が高い [ASSUMED]** → コンテンツ品質批判(slop)との整合性あり
- 記事生成に「Humanizing content」工程(AI検出対策専用パス)
- バックリンクデータの出所は非公開 [ASSUMED: サードパーティSEO API]

## 7. Changelogから見える開発速度・方向性(96エントリ、2025-10-18〜2026-08-10)

**最大の発見: Okaraはピボット製品である**
- 2025-10〜11: 「マルチモデルAIチャット」製品(モデルセレクタ、E2EE、Lifetime Pro、Black Friday)。11/5「オープンソースAIモデルにリブランド」
- 2025-12: ピボット初動 — 「Reddit tool landing page + waitlist」。alternatives/solutionsページ量産(SEO布石)
- 2026-01〜04: AI CMO本格化。**2026-04-06 Introducing Okara AI CMO公開**、4/15にCMS auto-publish・記事ライブプレビュー
- 開発速度: 2025年10〜12月は**ほぼ毎日リリース**(2.5ヶ月47リリース)。2026年は減速・安定化。**2026-04-29→08-02に3ヶ月のchangelog空白** [ASSUMED: 非公開開発かリソースシフト]
- 方向性: (a) 手動承認→auto-publish拡大 (b) チャット(CMO)の全機能ハブ化 (c) 配信面拡大: Slack実装済み、TikTok/IG「Soon」、blog予告でLink Building/YouTube/Newsletterエージェント (d) 自社でGEO/SEOコンテンツマーケを大量実行中(blog 200本超・skills 70ページ・use-case 26業種 — ドッグフーディング [ASSUMED])
- 価格実験: $249→Lite/Pro→$99プロモと4ヶ月で3回変更。abandoned cartメール、アフィリエイト等グロース施策を高速に回す

## 8. マーケサイト上の主張(第三者検証なし)
「100,000+ businesses」、ロゴ(Kong、VWO、Razer、UpGuard、Cloud66、Sticker Mule、Insight Timer)、事例: Lovie(可視性+56%、CTR+73%)、Unlayer、Influencer事例「$2,000で24時間171,600ビュー」
