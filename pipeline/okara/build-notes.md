# Build Notes — Wasabi MVP (Stage 3)

spec/ からの逸脱、判断、およびspecへのフィードバック。

## 1. スペックの矛盾と解決

### 1-1. 失効した統合での Post now ボタン (E2E-016 vs SCR-014)
- **矛盾**: SCR-014 の States は「ERROR状態 → 関連機能(Post now等)は自動的にCopyフォールバックへ」
  = ボタンを隠す。一方 E2E-016 の手順5-6 は「トークンを失効させ、**Post now を押す** →
  『token expired』エラーが出て CURRENT に留まる」= ボタンが存在する必要がある。
- **解決**: E2E側を採用(spec-format.md が「04-e2e-cases.md は実装のゴールを定義する」と明記)。
  実装は `status === CONNECTED || status === ERROR` でボタンを表示する。
- **理由**: ボタンを隠すと「一度も接続していない」状態と見分けがつかず、
  ユーザーは何を直せばよいか分からない。押せてエラーが出るほうが誠実。
  Copy フォールバックは並存しているので SCR-014 の意図も満たす。
- **specへのフィードバック**: SCR-014 の States 記述を「ERROR時もアクションは残し、
  実行時に失効理由を提示する」に更新すべき。

### 1-2. llms.txt の所属 (SEO か GEO か)
- **矛盾**: AIF-005 は SEO監査のカテゴリ4に「サイトファイル(robots.txt/sitemap.xml/llms.txt)」を含める。
  一方 SCR-005 の GEOタブには「AI Readiness checklist (llms.txt/robots/sitemap/schema)」がある。
- **解決**: 実チェックは **SEO監査に一本化**。GEOタブの AI Readiness は SEO監査の結果を参照して表示する。
- **理由**: 両方でチェックすると同じ修正に対してカードが2枚生成される。
  GEOのissueは「引用されていないクエリ」に絞ったほうが画面の意味が明確。

## 2. スペックにない実装判断

| 項目 | 判断 | 理由 |
|---|---|---|
| 認証方式 | NextAuth ではなく jose + bcrypt の自前セッション | internal-first で単一プロバイダのみ。NextAuth v5 beta の設定面を持ち込むより薄い |
| Prisma 7 | `prisma.config.ts` + `@prisma/adapter-pg` が必須 | Prisma 7 では datasource url がスキーマから config に移動し、クライアントに adapter が必要 |
| LLMプロバイダ | `anthropic` と `offline` の2実装 + 環境変数で切替 | E2Eをモデル出力に依存させないため。offline は制約(禁止語・言語・ハイプ語)を尊重するので、テストは配線を検証できる |
| 外部連携 | 全て `src/lib/external.ts` の1モジュールに集約、`WASABI_MOCK_EXTERNAL=1` でモック | 実装計画のリスク対策「モック差し替え可能な外部境界」の具体化 |
| 品質ゲートの履歴 | 不合格→リライトの各試行を Draft として永続化 | リライトの経緯が監査可能。specは最終版のみ想定していたが、学習素材として有用 |
| 公開結果の表示 | 公開後もリンクを残す `last-result` バナー | 公開するとカードが CURRENT から消え、直前に作ったPR/投稿へのリンクを失っていた |
| E2E実行環境 | `next dev` ではなく **本番ビルド** | このサンドボックスでは dev専用チャンクの1つがブラウザ到達前に403になり、hydrationが壊れる(アプリの問題ではない) |
| テストDBリセット | `prisma migrate reset` ではなく TRUNCATE スクリプト | `migrate reset` は破壊的操作として同意を要求する。`*_test` 以外のDB名では実行を拒否するガード付き |

## 3. 修正した実バグ(E2E駆動で発見)

1. **モックサイトが404** — `src/app/__mock/` はアンダースコア始まりのため Next.js の
   private folder 扱いでルーティングから除外されていた。`src/app/testing/mock-site/` に移動。
2. **オンボーディングの名前自動補完がユーザー入力と競合** — URLのblurで名前を自動補完する処理が、
   ユーザーがすでに入力し始めた名前と競合して "127Shogun Test" のような値を作っていた。
   `nameTouched` フラグで、未タッチ時のみ補完するよう修正。
3. **effect内の同期setState (React 19 lint)** — feed/performance のデータ取得を
   コンポーネント外の純関数に切り出し、setter が effect から到達不能になるよう再構成。
   併せて stale response ガードを追加。
4. **per-source Sync がプロジェクト全体を同期していた** — 行ごとの Sync ボタンが
   CONTEXT_SYNC ジョブ(全ソース)を叩いていた。`POST /sources/[id]/sync` を追加して
   ボタンの意味と実挙動を一致させた。

## 4. 改善案(スペック外・未実装)

- **Reddit の関連性スコアリング**: 現在は取得順。商業意図スコア(ReplyGuy相当)を入れると精度が上がる
- **品質ゲートの閾値の設定化**: 現在ハードコード。SCR-003 にドロップ率を出して調整可能にする(spec AIF-008の意図)
- **ジョブのスケジュール実行**: `cycleHours` を保存しているが、cron/worker は未接続(手動 Run now のみ)
- **GEO の実エンジン照会**: `probeGeoCitations` の live 実装は未接続(モックのみ)。
  実装時は AthenaHQ の +45% を基準にする
- **記事の800語下限**: offline fixture は約400語。実モデルでは満たすが、
  文字数バリデーションを品質ゲートに追加すべき

## 5. Stage 4 (Skin/Ship) への引き継ぎ

- `src/brand.config.ts` の差し替えで全画面のリスキンが可能(`e2e/brand.spec.ts` で検証済み)
- 本番投入前に必須:
  - `AUTH_SECRET` の実値設定(現在の .env はdev用)
  - `ANTHROPIC_API_KEY` の設定(未設定だと offline プロバイダで静かに動作する)
  - `WASABI_MOCK_EXTERNAL` を **設定しない**(1 のままだと外部連携が全てモックになる)
  - X / GitHub / Google の実OAuthフロー実装(現在は接続レコードを直接書く形)
- ジョブの定期実行(cron または worker)の接続
