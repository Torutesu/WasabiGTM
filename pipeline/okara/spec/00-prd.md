# PRD: Wasabi — Growth OS (internal-first AI CMO)
- version: 1
- source_teardown: ../teardown.md
- target_users: 第一ユーザーは自社チーム(ShogunAI ほか自社プロダクトのグロース担当=founder自身)。外販フェーズ(スコープ外)で B2C/prosumer プロダクトの創業者・小チームへ拡大 [USER-REQ]
- mvp_scope: [SCR-021, SCR-001, SCR-002, SCR-003, SCR-004, SCR-005, SCR-009, SCR-010, SCR-011, SCR-012, SCR-014](11画面)
- out_of_scope:
  - 課金・クレジット・サブスクリプション(internal-firstのため。外販フェーズで設計)
  - Influencerマーケットプレイス/エスクロー(teardown §8 Drop)
  - UGC動画生成(フェーズ2: Creatify/HeyGen等の外部API連携で実装)
  - LinkedIn / TikTok / ASO / メール・ライフサイクル(フェーズ2。スキーマのChannel enumには予約済み)
  - チーム権限管理(全員ADMIN)・ワークスペース階層・ホワイトレーベル
  - SCR-006(被リンク分析)、SCR-017(WhatsApp/Telegram双方向チャット — 通知のみ実装)
  - Reddit自動投稿(意図的に永久スコープ外 — BAN回避原則)
- success_criteria:
  - E2E P0 16件が全通過(04-e2e-cases.md)
  - オンボーディング: URL入力→Foundation Docs 5種生成が5分以内
  - 日次サイクルが無人で回り、5チャンネル(X/Reddit/SEO_GEO/Article/Launch)のカードが品質ゲート通過済みで毎日届く
  - 配信物すべてに成果計測が紐付き、週次振り返り→learnings→次回生成への注入が機能する
  - **実運用基準: ShogunAIのグロース業務で毎日使われること**(dogfooding が最優先KPI)[USER-REQ]

## プロダクト原則(teardownからの決定事項)
1. **Living Context**: 生成の根拠は「公開ページのスクレイプ」ではなく、内部ソース(リポジトリ・分析・ユーザーの声)を含む常時更新のコンテキスト(§7-1)
2. **成果に閉じる**: 「投稿数」ではなく「獲得」が主語。全配信にUTM・計測・週次学習(§7-2)
3. **anti-slop**: 全ドラフトは敵対的品質ゲート(high tier)を通過したものだけがユーザーに届く(§7-8)
4. **プラットフォームへの敬意**: Reddit/HNは常に手動投稿。コミュニティ文化の理解を生成に組み込む(§8 Copy)
5. **開放性**: MCPネイティブ。Claude Code等から全操作可能(§7-9 — Okaraのクローズド設計への逆張り)
6. **日英ネイティブ**: 翻訳ではなく各言語ネイティブの生成 [USER-REQ]

## 技術スタック [ASSUMED: 実装チームの標準に合わせ変更可]
- Next.js (App Router) + TypeScript + Prisma + PostgreSQL
- Claude Agent SDK (TypeScript) — エージェント実行基盤。モデル: fable/opus(high)・sonnet(mid)・haiku(light)
- ジョブ: node worker + cron(自ホスト前提。Vercel Cronでも可)
- MCPサーバー: @modelcontextprotocol/sdk(stdio+HTTP)
- E2E: Playwright(外部APIはモックサーバー差し替え)
- デプロイ: 自社インフラ(internal)。secrets は環境変数

## フェーズ計画
- **MVP(本spec、2週間)**: 11画面+11 AIF+P0 16件
- **フェーズ2(外販前)**: LinkedIn/TikTok/ASO/UGC動画(外部API)/リファラルループ設計/被リンク/多プロダクト運用強化/E2E P1
- **フェーズ3(外販)**: マルチテナント・課金(透明な従量制)・チーム権限・公開API/MCP・SOC 2 — Okaraの弱点(不透明クレジット・クローズド)を突く設計で
