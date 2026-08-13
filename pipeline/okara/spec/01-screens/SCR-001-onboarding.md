# SCR-001: Project Onboarding
- route: /projects/new
- auth: authenticated
- purpose: URL+内部コンテキストソースを登録し、解析を開始する(Okaraの「URL入力」を拡張: Living Context の入口)

## Layout
```
+--------------------------------------------------+
| Step 1: Product                                  |
|  [ Product URL            ] (必須)               |
|  [ Product name           ] (URLから自動補完可)   |
|  Phase: (o) Pre-launch  ( ) Launched  ( ) Growth |
|  Languages: [x] English [x] 日本語                |
| Step 2: Context sources (任意・後からSCR-004で追加可)|
|  [+ GitHub repo   ] [+ ドキュメント貼り付け ]      |
|  [+ GSC           ] [+ GA                  ]      |
| [ Start analysis ]                               |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| UrlInput | 必須。URL形式チェック、到達性チェック(HEAD) | Project.url |
| NameInput | URLのtitleから自動補完、編集可 | Project.name |
| PhaseRadio | 生成の重み付けに使用(prelaunchならLAUNCHチャンネル優先) | Project.phase |
| LanguageCheckbox | en/ja 最低1つ | Project.languages |
| ContextSourceAdder | kind選択+config入力(repo名/テキスト貼付/プロパティID)。追加分はリスト表示・削除可 | ContextSource |
| StartButton | プロジェクト作成+ONBOARD_ANALYSISジョブ起動 | Project, JobRun |

## States
- loading: Start押下後ボタン無効化→即 SCR-002 へ遷移
- error: URL到達不可は「サイトにアクセスできません」インライン表示(登録自体は許可 — ステージング前サイト対応)
- empty: 初回アクセス時はこの画面がホーム

## Interactions
- Start analysis → Project(status=ANALYZING)作成 → SCR-002
- GitHub repo追加 → SCR-014 の GitHub App 未接続なら「接続してください」リンク表示(追加自体は保留登録可)

## AI Behaviors
- none(解析はSCR-002で実行)
