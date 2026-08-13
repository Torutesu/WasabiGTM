# 05 — AI Features (Wasabi)

teardown §7 から採用したAIネイティブ機能の仕様。実装は Claude Agent SDK (TypeScript) を基盤とし、model_tier は以下にマップする:
- high = claude-fable-5 / claude-opus-5(戦略・品質判定・週次分析)
- mid = claude-sonnet-5(ドラフト生成・監査)
- light = claude-haiku-4-5(分類・スコアリング前処理・変化検知)

共通原則:
1. **全生成は Foundation Docs + learnings + Writing Instructions をコンテキストに含む**(ジェネリック出力=slopの根絶。teardown §7-1/§2-2)
2. **生成→品質ゲート→人間承認** の3段。品質ゲートを通らないものはユーザーに見せない
3. fallback は必ず「正直に失敗を見せる」(捏造・空outputの偽装をしない)

---

## AIF-001: Living Context 取り込み・変化検知
- trigger: スケジュール(24h)+手動Sync+オンボーディング
- input_context: ContextSource(WEBSITE: サイトクロール / GITHUB_REPO: README・changelog・リリースノート / DOCUMENT: 投入資料 / GSC・GA: 指標 / USER_FEEDBACK: 貼付テキスト)
- model_tier: light(変化検知・抽出)→ high(Foundation Docs 更新提案の生成)
- output: ContextSnapshot 保存。前回digestとの意味的差分があれば FoundationDoc への更新提案(diff形式)を生成。**自動上書きはしない** — SCR-004 で Accept/Reject
- fallback: ソース取得失敗はソース行にエラー表示、既存Snapshotで継続。提案生成失敗は「Update check failed, retry」
- e2e_ref: [E2E-002, E2E-018]

## AIF-002: Foundation Docs 生成(5種)
- trigger: オンボーディング(ONBOARD_ANALYSIS)/ 未生成時の手動Generate
- input_context: 全ContextSnapshot(公開サイト+内部ソース)。競合分析はWeb検索を併用
- model_tier: high(Okaraとの品質差の源泉。妥協しない)
- output: PRODUCT_DESCRIPTION / PRODUCT_INFO / MARKETING_STRATEGY / COMPETITOR_ANALYSIS / BRAND_VOICE の5文書(Markdown)。Strategyにはチャネル優先度と phase(prelaunch等)に応じた初期フォーカスを含む
- fallback: 一部文書の生成失敗は成功分のみ保存し、失敗分に「Generate」ボタン表示。3回リトライ後 FAILED
- e2e_ref: [E2E-002]

## AIF-003: X ドラフト生成
- trigger: DAILY_CYCLE(6時間ごと、dailyQuota分)
- input_context: Foundation Docs + learnings(直近WeeklyReview)+ voiceProfile + Writing Instructions + 直近投稿履歴(重複回避)+ language設定
- model_tier: mid(生成)
- output: FeedCard(type=tweet/thread)。5カテゴリローテーション(Okara同等)+ learnings による重み付け(Okaraに無い)。rationale に「なぜこの角度か」を明記
- fallback: 生成失敗はそのサイクルをスキップし Activity に記録(空カードを出さない)
- e2e_ref: [E2E-004, E2E-005, E2E-006, E2E-017]

## AIF-004: Reddit 機会発見+返信ドラフト
- trigger: DAILY_CYCLE
- input_context: AgentConfig.config.subreddits + keywords。Reddit公開JSON(読み取りのみ)で新着スレッド取得 → 関連性スコアリング → 上位のみドラフト化。subredditのルール・文化要旨(過去取得分をキャッシュ)
- model_tier: light(関連性スコアリング)→ mid(ドラフト)
- output: FeedCard(type=reddit_reply)。元スレッド情報+関連性説明+「質問に先に答え、製品言及は自然に・最小限・または無し」原則のドラフト。**投稿機能は実装しない(手動コピペのみ — BAN回避原則)**
- fallback: Reddit取得失敗(レート制限等)はそのサイクルをスキップ+Activity記録。連続失敗時はSCR-012に警告表示
- e2e_ref: [E2E-004, E2E-007]

## AIF-005: SEO/GEO 監査+fix生成
- trigger: AUDIT(24h)+手動Run audit
- input_context: サイトクロール(全ページ: meta/H1/schema/robots/sitemap/llms.txt)+ Lighthouse系メトリクス + GSCクエリ。GEO: ChatGPT/Perplexity/Gemini/Claude への実クエリで購買意図プロンプト群の引用有無を検証(Top Prompts)
- model_tier: light(チェックリスト系)→ mid(fix内容生成: llms.txt全文・JSON-LD・メタ文言)
- output: SiteAudit(kind=SEO/GEO, score, issues[])。Create fix で FeedCard(type=seo_fix/geo_fix)→ GitHub PR(リポジトリ文脈を読んだ実コード。自動マージなし)
- fallback: 外部エンジンクエリ失敗は前回結果+staleバッジ。PR作成失敗はカードにエラー+手動手順のフォールバック表示
- e2e_ref: [E2E-008, E2E-004]

## AIF-006: 記事/LPライター
- trigger: DAILY_CYCLE(quota分)+ SCR-005 Top Prompts からの手動生成
- input_context: Foundation Docs + キーワードギャップ(GSC)+ GEO Top Prompts + 競合コンテンツ(検索)+ learnings
- model_tier: mid(執筆)、high(構成・アングル設計)
- output: FeedCard(type=article)。800-2,000語Markdown、targetKeyword、meta、OG画像プロンプト。6記事タイプ(SEO/Thought Leadership/How-To/Comparison/Case Study/Listicle)+ 比較LP・use-caseページ(pSEO)
- fallback: 生成失敗はスキップ+Activity記録
- e2e_ref: [E2E-009, E2E-011]

## AIF-007: ローンチ支援(HN / Product Hunt)[USER-REQ: B2C]
- trigger: DAILY_CYCLE(phase=prelaunch/launched初期のみ有効)
- input_context: Foundation Docs + HN/PHの成功事例パターン(内蔵プレイブック)+ phase
- output: FeedCard(type=hn_show/ph_launch)。Show HNタイトル+本文3バリエーション(技術軸/成果軸/独自性軸)、PHタグライン・ギャラリー構成案・ハンターコメント。ハイプ語禁止ルール+推奨投稿時刻。提出は常に手動
- model_tier: high(ローンチは一発勝負のため)
- fallback: 生成失敗はスキップ+Activity記録
- e2e_ref: [E2E-015]

## AIF-008: 品質ゲート(anti-slop パイプライン)
- trigger: 全ドラフト生成直後(イベント)+ Regenerate
- input_context: ドラフト + Foundation Docs(Brand Voice/Product Info)+ channel別基準(Reddit/HNはコミュニティ適合を追加)+ 言語別基準(ja: 機械翻訳調・体言止め連発の検査)
- model_tier: high(判定は妥協しない — Okaraとの品質差の核)
- output: QualityReview{genericScore, factualScore, voiceScore, communityScore, passed, critique}。不合格→critiqueを添えて自動リライト(AGENT_FIX、最大3回)→なお不合格ならカードを出さずActivityに記録
- fallback: ゲート自体の失敗時はドラフトを「未検証」バッジ付きでフィードに出す(ブロックしない — ただし目立つ警告)
- e2e_ref: [E2E-010, E2E-003]

## AIF-009: 成果分析・週次振り返り(自己改善ループ)
- trigger: スケジュール(週1・月曜朝)+手動
- input_context: 7日分のPublishRecord+OutcomeMetric+MetricSnapshot+アーカイブ理由+人間編集diff(HUMAN drafts)
- model_tier: high
- output: WeeklyReview(Markdown: 効いた/効かなかった/次週方針)+ learnings(構造化: 角度・フック・チャネル・時間帯)。learnings は以後の全生成プロンプトに注入
- fallback: データ不足時は「Not enough data」と正直に出す(捏造禁止)
- e2e_ref: [E2E-012]

## AIF-010: founderボイス学習
- trigger: イベント(HUMAN draft保存・Archive理由記録が閾値到達)+ 初期設定(過去投稿の取り込み)
- input_context: 人間編集前後のdiff、アーカイブ理由、(設定時)founderの過去X投稿
- model_tier: mid
- output: AgentConfig.voiceProfile 更新(語彙・構文・トーンの特徴、避けるパターン)。以後の生成に注入
- fallback: プロファイル生成失敗時は既存プロファイル維持
- e2e_ref: [E2E-006, E2E-014]

## AIF-011: CMOチャット
- trigger: ユーザー操作(メッセージ送信)+ DAILY_CYCLE完了時のdaily rundown自動投下
- input_context: Foundation Docs(常時)+ @メンション指定コンテキスト + 直近learnings + 直近指標サマリー
- model_tier: high
- output: ストリーミング応答。参照コンテキストをcontextRefsとして明示(透明性 — OkaraのCoTトグルの上位互換)。生成物提案は「Add to feed」アクション付きカードとして返す
- fallback: 失敗時は自動リトライ1回→エラーメッセージ(入力保持)
- e2e_ref: [E2E-013]

---

## モデルコスト概算(internal-first、1プロジェクト/日)
- DAILY_CYCLE 4回 × 7カード × (mid生成+high判定) ≈ 60-100回のLLM呼び出し/日
- 監査・同期・チャット込みで **$5-15/日/プロジェクト** 程度 [ASSUMED: トークン量に依存。実測して調整]
- Okaraの月$99(2,000クレジット)と比較: 内製の方が高くつく可能性があるが、品質差(high tier判定)が戦略的に正しい [USER-REQ: 品質優先]
