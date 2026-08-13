# SCR-014: Integrations
- route: /projects/[slug]/integrations
- auth: authenticated
- purpose: 外部サービス接続の管理(X OAuth / GitHub App / GSC / GA / CMS webhook)

## Layout
```
+--------------------------------------------------+
| X (Twitter)   ● Connected as @torutesu  [Disconnect] |
| GitHub        ○ Not connected           [Connect]    |
| Search Console● Connected (syogun.com)  [Disconnect] |
| Analytics     ○ Not connected           [Connect]    |
| CMS publish   ○ Not configured          [Configure]  |
|   (webhook URL+secret / 対象: 自社ブログ)             |
| ⚠ X token expired — [Reconnect]  (ERROR時)           |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| IntegrationRow | kind別: 状態(●/○/⚠)、接続先識別子表示、Connect/Disconnect/Reconnect | Integration |
| XConnectFlow | OAuth 2.0 PKCE → コールバックで CONNECTED。投稿権限のみ要求(Okara同等の最小権限) | Integration(X_OAUTH) |
| GitHubConnectFlow | GitHub App インストール → リポジトリ選択(複数可 — Okaraの1リポ制限を撤廃) | Integration(GITHUB_APP) |
| GoogleConnectFlow | OAuth → GSC: サイト選択 / GA: プロパティ選択 | Integration(GSC/GA) |
| CmsConfigModal | webhook URL + secret + フィールドマッピング(title/body/slug/og) | Integration(CMS_WEBHOOK) |

## States
- loading: 接続フロー中はボタンスピナー
- error: ERROR状態(トークン失効)→ ⚠+Reconnect。関連機能(Post now等)は自動的にCopyフォールバックへ
- success: 接続後トースト+状態更新

## Interactions
- Connect → OAuth/インストールフロー → コールバック → 本画面に戻り CONNECTED
- Disconnect → 確認 → トークン破棄。既存 PublishRecord は保持
- GSC/GA接続完了 → 初回 METRIC_PULL を即時実行

## AI Behaviors
- none
