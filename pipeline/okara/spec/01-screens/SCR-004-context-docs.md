# SCR-004: Context & Foundation Docs
- route: /projects/[slug]/docs
- auth: authenticated
- purpose: Foundation Docs 5種の閲覧・編集と、Living Context ソースの管理(Okara Companyパネルの上位互換)

## Layout
```
+--------------------------------------------------+
| Tabs: [Docs] [Sources]                           |
| --- Docs ---                                     |
| ┌ Product Description ┐┌ Strategy ┐┌ Brand Voice ┐ ...
| 選択中の文書:                                      |
|  [Markdownエディタ                    ]            |
|  Updated 2h ago by agent · v12  [History]        |
|  [ Save ] [ Copy ] [ Download ]                  |
| --- Sources ---                                  |
|  WEBSITE syogun.com     last sync 6h ago [Sync]  |
|  GITHUB  shogun-app     last sync 6h ago [Sync]  |
|  DOCUMENT brand-guide.md            [View][Del]  |
|  [+ Add source]                                  |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| DocTabs | 5種切替。未生成(解析失敗時)は「Generate」ボタン | FoundationDoc |
| MarkdownEditor | 編集可。Save で version+1、Revision保存。保存時トースト「次の生成サイクルから反映」 | FoundationDoc, Revision |
| HistoryDrawer | 版一覧、diff表示、任意版へRevert | FoundationDocRevision |
| SourceList | ContextSource一覧。Syncで CONTEXT_SYNC ジョブ起動。lastSync表示 | ContextSource |
| AddSourceModal | kind選択+config(SCR-001と同UI) | ContextSource |

## States
- loading: スケルトン
- empty(Sources): WEBSITE のみ(オンボーディングで自動作成)
- error: Sync失敗 → ソース行に赤アイコン+エラー文言
- success: Save後トースト

## Interactions
- Save → 即保存。次回 DAILY_CYCLE から生成に反映(E2E-003)
- Sync → CONTEXT_SYNC 実行 → 変化検知時は影響ドキュメントに「Update suggested」バッジ→クリックで agent 更新案を diff 表示→Accept/Reject(人間編集を黙って上書きしない)
- History → Revert で旧版復元

## AI Behaviors
- AIF-001: ソース同期時に変化を検知し、Foundation Docs の更新案を diff として提案(自動上書きはしない — 人間編集の保護)
- fallback: 生成失敗時は既存文書を保持し「Generate failed, retry」表示
