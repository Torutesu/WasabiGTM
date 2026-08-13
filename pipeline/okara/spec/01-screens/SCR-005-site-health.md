# SCR-005: Site Health (SEO / GEO)
- route: /projects/[slug]/site
- auth: authenticated
- purpose: SEO監査とGEO(AI検索可視性)監査の表示とfix起動(OkaraのAnalytics SEO/GEO/Technicalタブを1画面に統合)

## Layout
```
+--------------------------------------------------+
| Tabs: [SEO] [GEO]                                |
| SEO score: 81 (+2 this week)   GEO score: 72     |
| --- Issues (優先度順) ---                          |
| [HIGH] Missing meta description on /pricing      |
|    詳細 / 修正案 / [Create fix →]                 |
| [MED ] llms.txt not found                        |
|    詳細 / 修正案(生成済み内容プレビュー) / [Create fix →]|
| --- GEOタブ追加要素 ---                            |
| AI Readiness checklist (llms.txt/schema/robots)  |
| Top Prompts: 引用されるべき購買意図クエリ10件         |
|  各行: クエリ / 現在引用: ✗ / 競合引用: Littlebird ✓ |
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| ScoreHeader | 最新 SiteAudit.score + 前回差分 | SiteAudit |
| IssueList | issues を severity順。展開で detail + fixSuggestion 表示 | SiteAudit.issues |
| CreateFixButton | Issue → FeedCard(channel=SEO_GEO, type=seo_fix/geo_fix) 生成し SCR-010 へ誘導。GitHub接続済みならカードからPR作成可 | FeedCard |
| AIReadinessChecklist | GEO: llms.txt / robots / sitemap / schema の pass/fail | SiteAudit(kind=GEO) |
| TopPromptsTable | クエリ / 自社引用有無 / 競合引用 / 対応コンテンツ提案リンク | SiteAudit(kind=GEO).issues |
| RunAuditButton | AUDIT ジョブ手動起動(日次自動もあり) | JobRun |

## States
- loading: スケルトン
- empty: 監査未実行 → 「Run first audit」CTA
- error: 監査失敗 → バナー+Retry
- success: スコア+Issue一覧

## Interactions
- Create fix → カード生成 → トースト「Added to feed」+リンク → SCR-010
- Run audit → 実行中インジケータ → 完了で再読込
- Top Prompts の「対応コンテンツ提案」→ Article カード生成(SCR-010)

## AI Behaviors
- AIF-005: 日次AUDITジョブが SEO/GEO を採点し issues を生成。GEOは4エンジン(ChatGPT/Perplexity/Gemini/Claude)への実クエリで引用有無を検証
- fallback: 外部エンジンクエリ失敗時は前回結果を保持し「stale」バッジ表示
