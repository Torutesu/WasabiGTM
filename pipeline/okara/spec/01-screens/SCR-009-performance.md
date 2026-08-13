# SCR-009: Performance (成果クローズドループ)
- route: /projects/[slug]/performance
- auth: authenticated
- purpose: 配信物→計測→学習のループを可視化(Okaraに無い最大の差別化画面。teardown §7-2)

## Layout
```
+--------------------------------------------------+
| 期間: [ 7d | 28d | 90d ]                          |
| ファネル: 配信 24 → インプレッション 48.2k → クリック 1.2k → サインアップ 34 |
| --- チャネル別 ---                                 |
| X       12 posts | 32k imp | 800 clicks | 21 su  |
| Reddit   6 posts |  9k views| 300 clicks | 8 su   |
| Article  3 pub   |  6k imp | 90 clicks  | 5 su   |
| --- 個別配信成績 (ソート可) ---                      |
| [投稿タイトル/URL | channel | imp | clicks | 変換]   |
| --- Weekly Reviews ---                           |
| 2026-08-10: 「比較アングルのツイートがCTR 3倍。今週は...」[展開] |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| FunnelBar | PublishRecord+OutcomeMetric+MetricSnapshot を期間集計 | OutcomeMetric |
| ChannelTable | チャネル別集計。行クリックで個別一覧へフィルタ | PublishRecord |
| RecordTable | 個別配信の成績。externalUrl リンク。MANUAL配信でURL未登録の行は「Add URL」入力 | PublishRecord |
| WeeklyReviewList | WeeklyReview を新しい順。learnings は「次サイクルに反映済み」バッジ | WeeklyReview |
| GenerateReviewButton | WEEKLY_REVIEW ジョブ手動起動 | JobRun |

## States
- loading: スケルトン
- empty: 配信ゼロ → 「Publish your first card」+ SCR-010 リンク
- error: 指標取得失敗ソースは列に「—」+ツールチップ

## Interactions
- Add URL(手動配信の成果紐付け)→ 保存後、次回 METRIC_PULL から計測対象
- Weekly Review 展開 → Markdown表示。learnings 編集可(人間による学習の上書き)
- 期間切替 → 集計再取得

## AI Behaviors
- AIF-009: 週次で成果を分析し WeeklyReview を生成。learnings(効いた角度/フック/チャネル)は次の DAILY_CYCLE の生成プロンプトに自動注入される
- fallback: データ不足週は「Not enough data — keep publishing」と正直に表示(捏造しない)
