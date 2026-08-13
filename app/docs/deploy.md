# デプロイと接続設定

URL で触れる状態にするまでの手順。構成は2案あり、**A(無料)を推奨**。

| | A: 自前マシン + Cloudflare Tunnel | B: Cloudflare Workers |
|---|---|---|
| 費用 | **0円**(マシン代のみ。ドメインも `*.trycloudflare` 不要なら Cloudflare の無料枠で足りる) | Workers Paid **$5/月** |
| DB | 同居 Postgres(コンテナ) | Neon 無料枠 + Hyperdrive 無料枠 |
| スケジューラ | compose の `cron` サービス | Cron Triggers |
| 制限 | マシンが落ちると止まる | — |
| 検証状況 | **このリポジトリで実際にビルド・起動・cron 実行まで確認済み** | 設定ファイルのみ提供(Cloudflare アカウントが必要で未実行) |

> Workers **Free** プランでは動きません。CPU 10ms/リクエスト・サブリクエスト 50件/リクエストという上限があり、モデル呼び出しを何十回もする daily cycle は確実に超えます。Paid($5/月)は CPU 5分・サブリクエスト 1000件なので動きます。

---

## A. 自前マシン + Cloudflare Tunnel(無料・推奨)

### 1. 環境変数

```bash
cd app
cp .env.example .env
openssl rand -hex 32   # AUTH_SECRET に貼る(トークン暗号化にも使われる)
openssl rand -hex 32   # CRON_SECRET に貼る
```

最低限必要なのは `AUTH_SECRET` / `CRON_SECRET` / `SEED_USER_PASSWORD` と、LLM のキーを1つ
(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `OPENCODE_API_KEY` のいずれか)。
キーが1つも無い場合 `WASABI_LLM_PROVIDER=auto` は `offline`(固定文フィクスチャ)に落ちます。

### 2. 起動

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
docker compose -f deploy/docker-compose.yml --env-file .env run --rm migrate
```

`migrate` は `prisma migrate deploy` と初期ユーザーの seed を実行します。
この時点で `http://127.0.0.1:3000` にログイン画面が出ます。

### 3. 公開 URL(Cloudflare Tunnel)

1. Cloudflare ダッシュボード → Zero Trust → Networks → Tunnels → **Create a tunnel**(Cloudflared)
2. トンネル名を付けるとトークンが表示される → `.env` の `CLOUDFLARE_TUNNEL_TOKEN` に貼る
3. Public hostname を追加:
   - Subdomain/Domain: 使いたいホスト名(Cloudflare で管理しているドメイン)
   - Service: **HTTP** / `app:3000`
4. `.env` の `APP_URL` にその `https://…` を入れて `docker compose … up -d`

`APP_URL` は OAuth のリダイレクト URI 生成に使うので、**必ず実際にブラウザで開く URL** と一致させること。

### 4. 自動サイクル

compose の `cron` サービスが15分ごとに `/api/cron/tick` を叩きます。間隔を変えるなら
`.env` に `CRON_INTERVAL_SECONDS=600` など。手で叩く場合:

```bash
curl -X POST "$APP_URL/api/cron/tick?limit=1" -H "authorization: Bearer $CRON_SECRET"
```

1回の tick で走るジョブは**最大1件**(`?limit=` で最大5件まで)。同じプロジェクトで
ジョブが走っている間は起動せず、30分以上進捗のない RUNNING は失敗として回収します。

---

## B. Cloudflare Workers($5/月)

```bash
cd app
npm i -D @opennextjs/cloudflare wrangler
cp deploy/cloudflare/wrangler.jsonc deploy/cloudflare/open-next.config.ts deploy/cloudflare/worker.ts .
```

1. **DB**: Neon(無料枠)で Postgres を作る → 接続文字列を控える
2. **Hyperdrive**(無料枠: 10 config / 10万クエリ日):
   ```bash
   npx wrangler hyperdrive create wasabi-db --connection-string "postgres://…"
   ```
   出力された id を `wrangler.jsonc` の `hyperdrive[0].id` に貼る
3. **マイグレーション**は手元から直接 Neon に流す:
   ```bash
   DATABASE_URL="postgres://…" npx prisma migrate deploy
   DATABASE_URL="postgres://…" npm run db:seed
   ```
4. **シークレット**:
   ```bash
   npx wrangler secret put AUTH_SECRET
   npx wrangler secret put CRON_SECRET
   npx wrangler secret put APP_URL
   npx wrangler secret put ANTHROPIC_API_KEY   # 使う分だけ
   ```
5. **デプロイ**:
   ```bash
   npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
   ```

Cron Trigger(15分ごと)は `worker.ts` の `scheduled` が `/api/cron/tick` を叩きます。

---

## コネクタ設定

すべて Settings → Integrations 画面から接続します。サーバー側に資格情報が無いコネクタは
「何を設定すれば有効になるか」を画面に表示します。

### X (Twitter)

1. https://developer.x.com → Projects & Apps → User authentication settings
2. Type: Web App(Confidential)/ Native App(Public)どちらでも可
3. Callback URI: `<APP_URL>/api/integrations/x/callback`
4. Permissions: **Read and write**
5. Client ID / Secret を `.env` の `X_CLIENT_ID` / `X_CLIENT_SECRET` へ

OAuth 2.0 + PKCE、スコープは `tweet.read tweet.write users.read offline.access`。
`offline.access` が無いとリフレッシュトークンが発行されず数時間で切れます。

### Google(Search Console / Analytics)

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID(Web application)
2. Redirect URI: `<APP_URL>/api/integrations/google/callback`
3. 同じプロジェクトで **Search Console API** / **Google Analytics Data API** /
   **Google Analytics Admin API** を有効化
4. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を `.env` へ

接続時、プロジェクト URL のホストに一致する GSC プロパティと、プロジェクト名に一致する
GA4 プロパティを自動で選びます。

### GitHub(実 PR)

**GitHub App の場合**

1. Settings → Developer settings → GitHub Apps → New GitHub App
2. Callback URL: `<APP_URL>/api/integrations/github/callback`
3. Permissions(Repository): **Contents: Read and write** / **Pull requests: Read and write**
4. 秘密鍵をダウンロード → PKCS#8 に変換(WebCrypto が PKCS#1 を読めないため):
   ```bash
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key.pkcs8.pem
   ```
5. `GITHUB_APP_ID` / `GITHUB_APP_SLUG`(URL のスラッグ)/ `GITHUB_APP_PRIVATE_KEY` を `.env` へ

**トークンで済ませる場合**: Integrations 画面の GitHub 行で「Use a token」→
fine-grained personal access token(Contents: RW / Pull requests: RW)と `owner/name` を入力。

どちらの場合も PR は**作るだけ**でマージはしません。

### CMS / Slack

Webhook URL と共有シークレットを画面から設定。CMS へは
`{title, body, slug, og, keyword}` を POST し、`x-wasabi-secret` ヘッダに
シークレットを載せます。

### GEO 計測(任意)

`PERPLEXITY_API_KEY` を設定すると、購買意図プロンプトで自社が引用されるかを実測します。
未設定なら推測せず「未計測」として扱います。

---

## セキュリティ上の前提

- LLM の API キーは**環境変数のみ**。DB には入れません。
- サードパーティのトークン(X / Google / GitHub / CMS シークレット)は `AUTH_SECRET`
  から導出した鍵で **AES-GCM 暗号化して保存**します(`src/lib/secrets.ts`)。
  `AUTH_SECRET` を変えると既存の接続は復号できなくなるので、再接続が必要です。
- `WASABI_MOCK_EXTERNAL=1` は**本番で絶対に設定しない**こと。全ての外部送信がモックになります。
- `CRON_SECRET` 未設定なら `/api/cron/tick` は 503 を返し、自動サイクルは動きません。
