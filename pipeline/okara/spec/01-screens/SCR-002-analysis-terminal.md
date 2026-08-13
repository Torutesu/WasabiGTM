# SCR-002: Analysis Terminal
- route: /projects/[slug]/analyzing
- auth: authenticated
- purpose: オンボーディング解析のライブ進捗表示(Okaraの「魔法の瞬間」を同等以上に再現)

## Layout
```
+--------------------------------------------------+
| $ Initializing Wasabi CMO...                     |
| > Reading https://syogun.com ... ✓ (12 pages)    |
| > Reading GitHub repo shogun-app ... ✓           |
| > Drafting Product Description ... ✓             |
| > Drafting Marketing Strategy ... ⠋              |
| ────────────────────────────────                 |
| [████████░░░░] 4/7 steps                         |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| TerminalLog | JobRun.log をSSE/ポーリング(2s)でストリーム表示。等幅フォント、自動スクロール | JobRun |
| ProgressBar | ステップ完了数/総数 | JobRun.log から導出 |
| RetryButton | status=FAILED時のみ表示。ジョブ再実行(進捗保持) | JobRun |

## States
- loading: ターミナルにログが流れる(これが主表示)
- error: FAILED(3回リトライ後)→ 赤字でエラー+Retryボタン
- success: 「✓ Context loaded and CMO initialized」表示後、2秒で SCR-003 へ自動遷移

## Interactions
- 完了 → SCR-003 へ自動遷移
- Retry → ONBOARD_ANALYSIS 再実行(完了済みステップはスキップ)

## AI Behaviors
- AIF-001(コンテキスト取り込み)+ AIF-002(Foundation Docs 5種生成)がバックグラウンドで実行され、進捗がここに流れる
- 目標時間: 5分以内(Okara: Free 3-5分/Paid 5-8分)
