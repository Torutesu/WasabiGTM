# Decisions Log — Clone Factory: okara (WasabiGTM)

## 2026-08-13 — Stage 1 開始
- 入力URL: https://okara.ai/ (AI CMO — マルチエージェント・マーケティング自動化)
- ユーザー要件 [USER-REQ]:
  1. Okaraの「100倍いいもの」を作る
  2. 用途: 自社C向けAIプロダクト **ShogunAI** (syogun.com, macOSアプリ, $62/mo, グローバル英日) のグロース + その他プロダクトのグロース
  3. グローバル覇権が目標
  4. 外販(SaaS化)も予定 — ただし **まず内部で使い続けて磨き込む** (internal-first)
  5. 競合サービスを徹底的に洗い出し、機能・精度すべて同等以上 → その後細部を磨く
- ステージ判定: pipeline/ 未作成 → Stage 1 (Teardown) から
- リサーチ体制: 並列4エージェント
  (a) Okara docs/pricing/changelog 深掘り
  (b) AI CMO系フルスイート競合の全数調査
  (c) チャンネル特化型ベスト・オブ・ブリードツール調査 (SEO/GEO/Reddit/X/LinkedIn/UGC/インフルエンサー/B2C固有: ASO・TikTok)
  (d) Okaraの実ユーザー評価・弱点・会社情報
- 注記: Okaraのターゲットは B2B SaaS 中心。ShogunAI は **B2C (prosumer)** のため、
  B2C チャンネル (Product Hunt, HN, TikTok, ASO, バイラルループ) の重み付けを
  teardown セクション 8/9 で [USER-REQ] として調整する。

## 2026-08-13 — Stage 1 完了 → Stage 2 続行判断
- teardown.md 完成 (confidence: high)。research/ 4ファイルに生データ保存
- ユーザー依頼が「リサーチ→**要件定義→実装計画**」まで明示していたため、
  ステージ境界確認を待たず Stage 2 (Spec) へ続行。Stage 3 (Build 実行) は指示範囲外なので着手しない
- Open Questions のうちユーザー判断系は以下のデフォルトを [ASSUMED] として採用
  (最終報告で確認を求める。Spec は差し替え可能な構造にする):
  1. **ShogunAIフェーズ**: プレローンチ〜Early Access期と仮定 (brand skill の「Get Early Access」CTA より)。
     → ローンチ支援 (PH/HN) エージェントを MVP に含める
  2. **マルチプロダクト**: スキーマは複数 Project 対応、UI は単一プロジェクト優先
  3. **インターフェース**: 最小Webダッシュボード + 自身のMCPサーバー化。Slack/Telegram通知はオプション設定
  4. **投稿主体**: founder個人アカウント優先 (X)。公式アカウントは設定で追加可能な設計
  5. **外部API課金**: MVPは無料/低額のみ (GSC/GA無料、Reddit読み取りは公開JSON+手動投稿、
     SEOデータはGSC中心。DataForSEO/UGC動画APIはフェーズ2)
  6. **言語**: 英語主・日本語従の両言語対応を最初から (brand skill が日英併記のため)
- プロダクト名: **Wasabi** (リポジトリ名 WasabiGTM より)。内部グロースOS → 将来外販
