# デプロイと接続設定

URL で触れる状態にするまでの手順。**Cloudflare Workers が本命の構成**で、Docker + Cloudflare
Tunnel を代替として残してある。

| | A: Cloudflare Workers(本命) | B: 自前マシン + Cloudflare Tunnel |
|---|---|---|
| 費用 | Workers Paid **$5/月** + Neon/Hyperdrive 無料枠 | **0円**(マシン代のみ) |
| DB | Neon 無料枠 ← Hyperdrive 無料枠(10 config / 10万クエリ日) | 同居 Postgres コンテナ |
| スケジューラ | Cron Triggers(15分ごと) | compose の `cron` サービス |
| 運用 | サーバー管理なし・自動スケール | マシンが落ちると止まる |
| 検証状況 | **E2E 17件すべてが workerd 上で通過**(ローカル Hyperdrive 経由) | イメージのビルド・起動・cron 実行を確認済み |

> Workers **Free** プランでは動きません。CPU 10ms/リクエスト・サブリクエスト 50件/リクエストで、
> モデル呼び出しを何十回もする daily cycle は必ず超えます。Paid は CPU 5分・サブリクエスト1000件。

---

## A. Cloudflare Workers

### 1. データベース(Neon + Hyperdrive)

```bash
# 1. Neon(無料枠)で Postgres を作り、接続文字列を控える
# 2. Hyperdrive を作る(Worker から Postgres に繋ぐには接続プールが要る)
npx wrangler hyperdrive create wasabi-db --connection-string "postgres://…"
```

出力された id を `wrangler.jsonc` の `hyperdrive[0].id` に貼る。
マイグレーションと初期ユーザーは手元から Neon に直接流す:

```bash
DATABASE_URL="postgres://…" npx prisma migrate deploy
DATABASE_URL="postgres://…" npm run db:seed
```

### 2. シークレット

```bash
openssl rand -hex 32   # AUTH_SECRET(セッション署名 + トークン暗号化)
openssl rand -hex 32   # CRON_SECRET(スケジューラの認証)

npx wrangler secret put AUTH_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put APP_URL          # 例 https://wasabi-growth-os.<subdomain>.workers.dev
npx wrangler secret put ANTHROPIC_API_KEY # 使うベンダーの分だけ
```

コネクタを使うなら `X_CLIENT_ID` / `X_CLIENT_SECRET` / `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` / `GITHUB_APP_ID` / `GITHUB_APP_SLUG` /
`GITHUB_APP_PRIVATE_KEY` / `PERPLEXITY_API_KEY` も同様に。

### 3. デプロイ

```bash
npm run cf:deploy    # opennextjs-cloudflare build && deploy
```

`triggers.crons` に書いた15分ごとの Cron Trigger が `worker.ts` の `scheduled` を叩き、
そこから `/api/cron/tick` が呼ばれて期限の来たジョブが1件走ります。

### 4. ローカルで Workers ランタイムを動かす

Node で動いても workerd で動くとは限らないので、リリース前はこちらで確認するのが確実です。

```bash
cp .dev.vars.example .dev.vars     # wrangler が Worker の env として読む
export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://wasabi:wasabi@127.0.0.1:5432/wasabi_test"
npm run cf:dev                     # http://127.0.0.1:8788
npm run test:e2e:workers           # 同じ E2E 17件を workerd に対して実行
curl "http://127.0.0.1:8788/cdn-cgi/local/scheduled"   # Cron Trigger の手動発火
```

### Workers 固有の落とし穴(対処済み)

実際にこの構成で踏んで直したもの。似た改修をするときは壊さないよう注意。

- **Prisma クライアントはリクエストごとに作る**(`src/lib/db.ts`)。Worker は
  リクエストをまたいでソケットを持ち越せず、前のリクエストが開いた接続を次が触ると
  「応答を返さないコード」と判定されてランタイムに殺されます。Node ではこれまで通り
  プロセス共有のシングルトン。
- **Prisma を Next にバンドルさせない**(`serverExternalPackages`)。Prisma は
  ランタイムごとに別ビルドを export conditions で出し分けており、Next に取り込ませると
  必ず Node 版が選ばれます。Node 版の WASM クエリコンパイラは Workers では
  `WebAssembly.Module(): Wasm code generation disallowed` で落ちます。
- **Prisma の生成先は `node_modules/@wasabi/prisma`**。相対パス import では
  package.json の export conditions が効かず、workerd 版が選ばれません。
- **`pg-cloudflare` を明示的にトレースに含める**(`outputFileTracingIncludes`)。
  `pg` が guarded require で読むためトレースから漏れ、バンドル時に解決できません。
- **バックグラウンド処理は `after()` で渡す**。`void runJob(...)` はレスポンス送出と同時に
  実行コンテキストごと破棄されます(オンボーディング解析が永久に終わらなくなる)。
- **バンドルサイズは gzip 5.5MB / 上限 10MB**。余裕はあるが無限ではないので、
  重い依存を足したら `npx wrangler deploy --dry-run` で確認すること。

---

## B. 自前マシン + Cloudflare Tunnel(無料)

```bash
cd app
cp .env.example .env    # AUTH_SECRET / CRON_SECRET / SEED_USER_PASSWORD / LLMキー
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
docker compose -f deploy/docker-compose.yml --env-file .env run --rm migrate
```

公開 URL は Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel。
Public hostname の Service を `http://app:3000` にし、発行されたトークンを `.env` の
`CLOUDFLARE_TUNNEL_TOKEN` に、公開 URL を `APP_URL` に入れて `up -d`。

自動サイクルは compose の `cron` サービスが15分ごとに `/api/cron/tick` を叩きます
(`CRON_INTERVAL_SECONDS` で変更可)。手で叩く場合:

```bash
curl -X POST "$APP_URL/api/cron/tick?limit=1" -H "authorization: Bearer $CRON_SECRET"
```

1回の tick で走るジョブは最大1件(`?limit=` で最大5件)。同じプロジェクトでジョブが
走っている間は起動せず、30分以上進捗のない RUNNING は失敗として回収します。

---

## コネクタ設定

すべて Integrations 画面から接続します。サーバー側に資格情報が無いコネクタは
「何を設定すれば有効になるか」を画面に表示します。

### X (Twitter)

1. https://developer.x.com → Projects & Apps → User authentication settings
2. Type: Web App(Confidential)/ Native App(Public)どちらでも可
3. Callback URI: `<APP_URL>/api/integrations/x/callback`
4. Permissions: **Read and write**
5. Client ID / Secret を `X_CLIENT_ID` / `X_CLIENT_SECRET` へ

OAuth 2.0 + PKCE、スコープは `tweet.read tweet.write users.read offline.access`。
`offline.access` が無いとリフレッシュトークンが出ず数時間で切れます。

### Google(Search Console / Analytics)

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID(Web application)
2. Redirect URI: `<APP_URL>/api/integrations/google/callback`
3. 同じプロジェクトで **Search Console API** / **Google Analytics Data API** /
   **Google Analytics Admin API** を有効化
4. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を設定

接続時、プロジェクト URL のホストに一致する GSC プロパティと、プロジェクト名に一致する
GA4 プロパティを自動で選びます。

### GitHub(実 PR)

**GitHub App の場合**

1. Settings → Developer settings → GitHub Apps → New GitHub App
2. Callback URL: `<APP_URL>/api/integrations/github/callback`
3. Permissions(Repository): **Contents: Read and write** / **Pull requests: Read and write**
4. 秘密鍵をダウンロードし PKCS#8 に変換(WebCrypto が PKCS#1 を読めないため):
   ```bash
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key.pkcs8.pem
   ```
5. `GITHUB_APP_ID` / `GITHUB_APP_SLUG`(URL のスラッグ)/ `GITHUB_APP_PRIVATE_KEY` を設定

**トークンで済ませる場合**: Integrations 画面の GitHub 行で「Use a token」→
fine-grained personal access token(Contents: RW / Pull requests: RW)と `owner/name`。

どちらも PR は**作るだけ**でマージはしません。

### CMS / Slack

Webhook URL と共有シークレットを画面から設定。CMS へは
`{title, body, slug, og, keyword}` を POST し、`x-wasabi-secret` ヘッダにシークレットを載せます。

### GEO 計測(任意)

`PERPLEXITY_API_KEY` を設定すると、購買意図プロンプトで自社が引用されるかを実測します。
未設定なら推測せず「未計測」として扱います。

---

## セキュリティ上の前提

- LLM の API キーは**環境変数(Workers ではシークレット)のみ**。DB には入れません。
- サードパーティのトークン(X / Google / GitHub / CMS シークレット)は `AUTH_SECRET`
  から導出した鍵で **AES-GCM 暗号化して保存**します(`src/lib/secrets.ts`)。
  `AUTH_SECRET` を変えると既存の接続は復号できず、再接続が必要になります。
- `WASABI_MOCK_EXTERNAL=1` は**本番で絶対に設定しない**こと。全ての外部送信がモックになります。
- `CRON_SECRET` 未設定なら `/api/cron/tick` は 503 を返し、自動サイクルは動きません。
