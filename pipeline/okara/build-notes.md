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

## 5. マルチLLMプロバイダ対応(spec範囲外・追加要件)

spec 05-ai-features.md は Anthropic 前提だったが、Anthropic / OpenAI / Gemini /
OpenCode Zen の4社に対応。`src/lib/llm/` にプロバイダレジストリとして再構成した。

| プロバイダ | キー | エンドポイント | 構造化出力 |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | 既定 | `output_config.format` (strict) |
| OpenAI | `OPENAI_API_KEY` | 既定 | `response_format: json_schema` (strict) |
| Gemini | `GEMINI_API_KEY` | 既定 | `responseSchema` (方言変換あり) |
| OpenCode Zen | `OPENCODE_API_KEY` | `https://opencode.ai/zen/v1` | loose JSON → strict に自動昇格 |

**設計判断**

- **キーはDBではなく環境変数**。internal-first でキーは運用者が持つもの。
  DB保存はキー漏洩の面を増やすだけで利点がない。Settings画面には
  「どのキーが設定済みか」の●/○だけを出し、値は返さない(ユニットテストで検証)。
- **`auto` の選択順**: Anthropic → OpenAI → Gemini → OpenCode。キーが1つも無ければ offline。
- **モデルはプロバイダごとにティア既定値を持つ**。
  解決順は `<PROVIDER>_MODEL_<TIER>` → `MODEL_<TIER>` → 既定値。
  既存の `MODEL_HIGH` 等は後方互換で動く。
- **Gemini のスキーマ方言**: `additionalProperties` を拒否し、nullable は
  `type: ["integer","null"]` ではなく `nullable: true`。`toGeminiSchema` で変換(ユニットテスト済み)。
- **OpenCode Zen は loose JSON がデフォルト**。Zen は Claude/GPT/Gemini/DeepSeek 等の
  混成カタログで、全モデルが strict schema を実装しているとは限らないため。
  エンドポイントが `json_schema` を受け入れたら strict に自動昇格する
  (400/404/422 かつ schema 関連のメッセージのときだけ loose にフォールバック)。
- **JSON抽出を堅牢化**: loose モードではコードフェンスや前置きが混ざるため、
  フェンス除去 → 括弧走査(文字列内のカッコを無視)で最初の完全なJSON値を取り出す。

**検証状況(正直に)**

- 4社すべて実エンドポイントに到達し、無効キーで正しい401/400が返ることを確認済み
  (= ベースURL・認証ヘッダ・SDK配線は正しい)
- **有効なキーでの構造化出力パスは未検証**(キーを持っていないため)。
  `npx tsx scripts/check-provider.ts <provider>` で1回の実呼び出しで確認できる
- E2E は `WASABI_LLM_PROVIDER=offline` を強制するので、実キーがマシンにあっても
  テスト結果は変わらない

## 6. Stage 4 (Skin/Ship) への引き継ぎ

- `src/brand.config.ts` の差し替えで全画面のリスキンが可能(`e2e/brand.spec.ts` で検証済み)
- 本番投入前に必須:
  - `AUTH_SECRET` の実値設定(現在の .env はdev用)
  - LLMキーを最低1つ設定(未設定だと offline プロバイダで静かに動作する。
    Settings画面に警告が出るので気付けるようにした)
  - `WASABI_MOCK_EXTERNAL` を **設定しない**(1 のままだと外部連携が全てモックになる)
  - X / GitHub / Google の実OAuthフロー実装(現在は接続レコードを直接書く形)
- ジョブの定期実行(cron または worker)の接続

## 7. 実コネクタ + スケジューラ + デプロイ(Stage 3 追補)

Stage 3 完了時点で「接続レコードを直接書く」形だったコネクタを、実際に外部へ届く実装に置き換えた。

### 実装したもの

| 機能 | 実体 | ファイル |
|---|---|---|
| トークンの暗号化保存 | AES-GCM(`AUTH_SECRET` から SHA-256 で鍵導出)、WebCrypto のみ使用 | `src/lib/secrets.ts` |
| OAuth 共通基盤 | PKCE / state cookie / リフレッシュ / `APP_URL` 解決 | `src/lib/oauth.ts` |
| X 実投稿 | OAuth 2.0 + PKCE → `POST /2/tweets`、401 は TOKEN_EXPIRED に変換 | `api/integrations/x/*`, `external.ts` |
| GitHub 実PR | App インストール → installation token(1時間、キャッシュ付き)→ base ref 取得 → ブランチ作成 → contents PUT → PR 作成 | `src/lib/github-app.ts`, `external.ts` |
| GSC/GA 実指標 | Google OAuth(offline)→ GA `runReport`(`sessionCampaignName` = cardId)+ GSC `searchAnalytics/query`(page 一致) | `api/integrations/google/*`, `external.ts` |
| X 指標 | `/2/tweets?ids=…&tweet.fields=public_metrics` | `external.ts` |
| スケジューラ | `POST/GET /api/cron/tick`(bearer or `?key=`)。1 tick = 最大1ジョブ | `src/lib/scheduler.ts`, `api/cron/tick` |
| デプロイ | Cloudflare Workers + Hyperdrive(本命)/ Docker + Tunnel(代替) | `wrangler.jsonc`, `worker.ts`, `Dockerfile`, `deploy/`, `docs/deploy.md` |

### 設計判断

- **トークンは暗号化して保存、APIキーは環境変数のまま**。前者はユーザーが画面から
  接続するもので DB に置くしかないが、後者は運用者が持つもので DB に置く利点がない。
- **スケジューラは 1 tick = 1 ジョブ**。Workers の CPU 上限にも、素の crontab にも
  同じ形で載る。同一プロジェクトで RUNNING があれば起動せず、30分進捗が無い RUNNING は
  失敗として回収する(プロセスが死んだ場合に永久に busy にならないため)。
- **ジョブの優先順は AUDIT → METRIC_PULL → WEEKLY_REVIEW → DAILY_CYCLE**。
  出力(cycle)より先に入力(監査・指標・学習)を更新するため。
  複数プロジェクトでは「最も遅延しているもの」を先に処理する。
- **GA の帰属は UTM**。publish 時に `utm_campaign=<cardId>` を刻んでいるので、
  GA を campaign 次元で引けばカード単位に戻る。GSC には campaign 次元が無いので
  page 一致(クエリ文字列は無視)で記事に当てる。
- **GitHub は PAT と App の両対応**。App は秘密鍵の PKCS#8 変換が要るため、
  すぐ試したい場合の逃げ道として fine-grained token 入力も残した。どちらもマージはしない。
- **Workers 無料プランは不可**(CPU 10ms/req、サブリクエスト 50/req)。
  「できるだけ無料で」の要求には *自前マシン + Cloudflare Tunnel* で応えた。

### 検証状況(正直に)

- **検証済み**: Docker イメージのビルド → 起動 → `/login` 200 →
  `POST /api/cron/tick` が実 Postgres に対して DAILY_CYCLE を SUCCESS まで実行 →
  秘密なしのリクエストは 401。E2E 17件(既存16 + scheduler 1)と unit 34件が通過。
- **未検証**: X / Google / GitHub の実 OAuth 往復(各社のアプリ登録が必要なため)。
  コードパスは E2E ではモック側を通る。実接続時に最初に落ちるとしたら
  redirect URI の不一致(`APP_URL` 設定漏れ)が最有力。
- **未検証**: Cloudflare Workers 経路(`deploy/cloudflare/`)。設定ファイルのみ提供。

## 8. Cloudflare Workers 対応(Stage 3 追補2)

デプロイ先を Workers に確定し、実際に workerd 上で E2E 17件が通るまで詰めた。
`@opennextjs/cloudflare` + Hyperdrive + Neon 構成。

### 踏んで直した Workers 固有の問題

| 症状 | 原因 | 対処 |
|---|---|---|
| `WebAssembly.Module(): Wasm code generation disallowed` | Prisma 7 の WASM クエリコンパイラ。Node 版はバイト列から `new WebAssembly.Module()` するが Workers は動的コード生成を禁止 | Prisma を `serverExternalPackages` に入れ、Next にバンドルさせず host bundler(workerd condition)に解決させる |
| 上記が直らない | import が `@/generated/prisma/client`(相対パス)で、package.json の export conditions が効いていなかった | 生成先を `node_modules/@wasabi/prisma` に移し、パッケージ指定子で import |
| `Could not resolve "pg-cloudflare"` | `pg` が guarded require で読むため Next のトレースから漏れる | `outputFileTracingIncludes` で明示 |
| 数リクエスト後に「応答を返さない」と判定されて強制終了 | Prisma クライアントをプロセス共有シングルトンにしていた。Worker はリクエストをまたいでソケットを持ち越せない | `src/lib/db.ts` を Proxy 化し、Cloudflare のリクエストコンテキスト(`Symbol.for("__cloudflare-context__")`)を鍵に**リクエストごと**のクライアントを返す。Node は従来どおりシングルトン |
| オンボーディング解析が永久に終わらない | `void runJob(jobId)` の投げっぱなしがレスポンス送出と同時に破棄される | `after()` でプラットフォームの waitUntil に渡す |
| Cron Trigger が exception で終わる | `ctx.waitUntil` 経由だと失敗が表に出ない | `scheduled` 内で await する(scheduled はハンドラの Promise が解決するまで生存する) |

### 検証状況

- **workerd 上で E2E 17件すべて通過**(`npm run test:e2e:workers`、ローカル Hyperdrive → Postgres)
- Cron Trigger の手動発火(`/cdn-cgi/local/scheduled`)で METRIC_PULL が SUCCESS まで実行
- `wrangler deploy --dry-run`: バンドル gzip 5.46MB(Workers の上限 10MB)
- Node 経路(Docker イメージ)も再検証済み。両方の経路が同じコードで動く
- **未検証**: 実アカウントへの `wrangler deploy`(Cloudflare アカウントが必要)
