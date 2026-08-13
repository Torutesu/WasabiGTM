# SCR-012: Project Settings
- route: /projects/[slug]/settings
- auth: authenticated
- purpose: エージェント設定(Writing Instructions・quota・有効化)、スケジュール、通知、プロジェクト情報の管理

## Layout
```
+--------------------------------------------------+
| Sections: [Agents] [Schedule] [Notifications] [General] |
| --- Agents ---                                   |
|  X        [on ] quota 1/day  [Instructions...]   |
|  Reddit   [on ] quota 2/day  [Instructions...]   |
|            subreddits: r/macapps, r/productivity |
|  SEO/GEO  [on ] quota 2/day                      |
|  Article  [on ] quota 1/day                      |
|  Launch   [on ] quota 1/day (prelaunchのため有効)  |
| --- Schedule ---                                 |
|  Cycle: every [6h ▼]  next run 15:00             |
| --- Notifications ---                            |
|  Slack webhook  [url          ] [Test]           |
|  Telegram bot   [token/chat_id] [Test]           |
| --- General ---                                  |
|  name / url / phase / languages 編集              |
|  [Danger] Pause project / Delete project         |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| AgentRow | enabled トグル、dailyQuota 数値、Instructions モーダル(自由記述+channel別設定: subreddits/keywords) | AgentConfig |
| ScheduleSelect | 3h/6h/12h/24h。次回実行時刻表示 | Project(config) |
| NotificationForm | webhook/bot設定+Testボタン(テスト送信) | Integration(SLACK_WEBHOOK/TELEGRAM_BOT) |
| GeneralForm | name/url/phase/languages 編集 | Project |
| DangerZone | Pause(ジョブ停止)/ Delete(確認ダイアログ、タイプ確認) | Project |

## States
- loading: スケルトン
- error: Test送信失敗 → インライン赤表示
- success: 保存トースト

## Interactions
- Instructions 保存 → 次サイクルから生成に反映(トーストで明示)
- Pause → status=PAUSED、全ジョブ停止。Resume で再開
- Delete → 確認後、プロジェクトと配下データ削除 → SCR-001 or 別プロジェクトへ

## AI Behaviors
- none(設定は生成時に参照される)
