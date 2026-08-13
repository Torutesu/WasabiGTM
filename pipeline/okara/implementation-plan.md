# Wasabi 実装計画(Stage 3 Build の実行プラン)

- 入力: spec/ 一式(00-prd 〜 05-ai-features)
- ゴール: E2E P0 16件全通過 + ShogunAIで実運用開始
- 期間: 2週間(10営業日)+ バッファ

## Day-by-Day マイルストーン

### Week 1 — 骨格と生成ループ
- **Day 1: 基盤**
  - リポジトリ初期化(Next.js + TS + Prisma + Playwright + ESLint)
  - 02-schema.md の Prisma スキーマ投入・マイグレーション
  - NextAuth Credentials(環境変数プロビジョニング)→ E2E-001
- **Day 2: プロジェクト作成とジョブ基盤**
  - SCR-001 / Project CRUD API
  - JobRun 基盤(worker プロセス + キュー + SSEログストリーム)
  - SCR-002(ターミナルUI)
- **Day 3: Living Context + Foundation Docs**
  - ContextSource 取り込み(WEBSITE クロール / DOCUMENT / GITHUB_REPO)
  - AIF-001 / AIF-002(Claude Agent SDK 実装、high tier)
  - SCR-004(エディタ+履歴+Sources)→ E2E-002, E2E-003
- **Day 4: DAILY_CYCLE + Xエージェント + 品質ゲート**
  - サイクルオーケストレーション(AgentConfig 駆動)
  - AIF-003(X ドラフト)+ AIF-008(品質ゲート、リライトループ)
  - SCR-010 の骨格(カードリスト+展開+編集)→ E2E-004, E2E-010
- **Day 5: Reddit + Launch エージェント**
  - AIF-004(Reddit 公開JSON読み取り+関連性スコア+ドラフト)
  - AIF-007(HN/PH ローンチ)
  - SCR-010 のカードtype別アクション(Copy/Mark as done/URL登録)→ E2E-007, E2E-015

### Week 2 — 配信・計測・学習・仕上げ
- **Day 6: 統合(X/GitHub)と配信**
  - X OAuth(PKCE)+投稿 / GitHub App+PR作成
  - SCR-014 → E2E-005, E2E-006, E2E-008, E2E-016
- **Day 7: SEO/GEO監査 + 記事**
  - AIF-005(監査+4エンジンGEO検証)+ SCR-005
  - AIF-006(記事)+ CMS webhook 配信 → E2E-009
- **Day 8: 成果ループ**
  - UTM付与 / METRIC_PULL(GSC/GA/X)/ OutcomeMetric 紐付け
  - SCR-009 + AIF-009(週次振り返り)→ E2E-011, E2E-012
- **Day 9: チャット + ダッシュボード + 通知**
  - AIF-011 + SCR-011(ストリーミング+@メンション+Add to feed)
  - SCR-003(Activity+Today)+ Slack/Telegram通知 → E2E-013, E2E-014
- **Day 10: MCPサーバー + 統合テスト + 実運用投入**
  - MCPツール9種(03-api.md)
  - E2E P0 全16件のグリーン確認、AIF-010(ボイス学習)結線
  - **ShogunAI 本番プロジェクト作成 → dogfooding 開始**

## 実装上の重要判断(spec準拠の再確認)
1. **品質ゲートは high tier で妥協しない** — Okaraとの差の核。コスト($5-15/日/プロジェクト目安)は品質優先で許容 [USER-REQ]
2. **Reddit 自動投稿は作らない** — コードレベルで投稿APIを持たない(誤って有効化できない構造)
3. **人間編集は神聖** — agent が HUMAN 版 Draft や人間編集済み FoundationDoc を黙って上書きするパスを作らない
4. **モック差し替え可能な外部境界** — X/GitHub/Google/Reddit/LLM すべて interface 化し、E2E はモックで回す
5. **learnings 注入はプロンプト組み立ての一級要素** — 後付けにしない(Day 4 の cycle 設計時点で組み込む)

## リスクと対策
| リスク | 対策 |
|---|---|
| GEO検証(4エンジン実クエリ)のAPI制約 | MVP は ChatGPT/Perplexity の2エンジンに縮退可 [ASSUMED]。stale表示で正直に |
| Reddit 公開JSONのレート制限 | 取得間隔を空ける+キャッシュ。失敗はスキップ(E2E-004の想定内) |
| GSC/GA OAuth 審査(内部利用) | 内部アプリとして自社Googleアカウントのみ対象(審査不要のInternalモード) |
| 品質ゲートの過剰リジェクト | 閾値を設定化し、ドロップ率を SCR-003 で可視化して調整 |
| 2週間スコープ超過 | 落とす順: SCR-011チャット → E2E-017〜021(P1) → SCR-009の一部(手動レポートで代替)。**落とさないもの: 品質ゲート・成果ループの骨格** |

## Stage 3 開始条件(ユーザー確認事項)
1. Open Questions 1-6(teardown Appendix)のデフォルト仮定の承認 or 修正
2. 技術スタック(Next.js/Prisma/Postgres/Claude Agent SDK)の承認
3. ShogunAI の実コンテキスト素材(既存X アカウント、GSC アクセス、リポジトリ)の提供
