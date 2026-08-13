# SCR-003: Dashboard Shell / Activity
- route: /projects/[slug]
- auth: authenticated
- purpose: プロジェクトのホーム。ナビゲーション+エージェント活動ログ+今日のサマリー

## Layout
```
+------+-------------------------------------------+
| Nav  |  Today at a glance                        |
| Feed |   [ 5 opportunities | 2 published | GEO 72 ]|
| Chat |  Activity (JobRun stream)                 |
| Docs |   09:00 DAILY_CYCLE ✓ 5 cards generated   |
| Site |   09:05 AUDIT ✓ GEO score 72 (+3)         |
| Perf |   14:00 METRIC_PULL ✓ gsc/ga/x synced     |
| Set  |                                           |
+------+-------------------------------------------+
ヘッダー: プロジェクトスイッチャー / ユーザーメニュー(Theme, Logout)
```

## Components
| Component | Behavior | Data |
|---|---|---|
| SideNav | Feed(SCR-010)/Chat(SCR-011)/Docs(SCR-004)/Site(SCR-005)/Performance(SCR-009)/Settings(SCR-012) | — |
| ProjectSwitcher | 複数Project時にドロップダウン。+New project → SCR-001 | Project[] |
| TodayCards | 未処理カード数(→SCR-010)、本日配信数、最新GEO/SEOスコア(→SCR-005) | FeedCard, PublishRecord, SiteAudit |
| ActivityStream | JobRun を新しい順に20件。kind別アイコン、FAILEDは赤+エラー展開 | JobRun |
| RunNowButton | DAILY_CYCLE を手動トリガー(実行中は無効) | JobRun |

## States
- loading: スケルトン
- empty: JobRunなし(解析直後)→「First cycle will run shortly」+ Run now
- error: 直近ジョブFAILED → バナー表示+詳細リンク

## Interactions
- TodayCards の未処理数クリック → SCR-010
- Run now → DAILY_CYCLE 起動、ActivityStream に RUNNING 行が現れる
- プロジェクトスイッチャー → 別プロジェクトの SCR-003

## AI Behaviors
- none(表示のみ。生成はジョブ側)
