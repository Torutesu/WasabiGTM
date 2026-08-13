# 03 — API Endpoints (Wasabi)

- 形式: Next.js App Router Route Handlers (`/api/...`)。認証は NextAuth セッション(auth列 = authenticated は全て)
- 加えて **MCPサーバー** が同等操作をツールとして公開する(下部参照)— teardown §7-9

## REST

| Method | Path | Auth | Request | Response | Screen |
|---|---|---|---|---|---|
| POST | /api/auth/callback/credentials | public | {email, password} | session | SCR-021 |
| GET | /api/projects | auth | — | Project[] | SCR-003 |
| POST | /api/projects | auth | {url, name, phase, languages, sources[]} | Project (status=ANALYZING, ONBOARD_ANALYSISジョブ起動) | SCR-001 |
| GET | /api/projects/[slug] | auth | — | Project+集計(未処理カード数/最新スコア) | SCR-003 |
| PATCH | /api/projects/[slug] | auth | {name?, url?, phase?, languages?, status?} | Project | SCR-012 |
| DELETE | /api/projects/[slug] | auth | — | 204 | SCR-012 |
| GET | /api/projects/[slug]/jobs | auth | ?kind=&limit= | JobRun[] | SCR-002, SCR-003 |
| GET | /api/projects/[slug]/jobs/[id]/stream | auth | SSE | log stream | SCR-002 |
| POST | /api/projects/[slug]/jobs | auth | {kind: DAILY_CYCLE\|AUDIT\|METRIC_PULL\|WEEKLY_REVIEW\|CONTEXT_SYNC, retryOf?} | JobRun | SCR-002, SCR-003, SCR-005, SCR-009 |
| GET | /api/projects/[slug]/docs | auth | — | FoundationDoc[] | SCR-004 |
| PATCH | /api/projects/[slug]/docs/[kind] | auth | {content} | FoundationDoc (Revision作成, updatedBy=userId) | SCR-004 |
| GET | /api/projects/[slug]/docs/[kind]/revisions | auth | — | Revision[] | SCR-004 |
| POST | /api/projects/[slug]/docs/[kind]/revert | auth | {version} | FoundationDoc | SCR-004 |
| POST | /api/projects/[slug]/docs/[kind]/apply-suggestion | auth | {suggestionId, accept: bool} | FoundationDoc | SCR-004 |
| GET | /api/projects/[slug]/sources | auth | — | ContextSource[] | SCR-004 |
| POST | /api/projects/[slug]/sources | auth | {kind, config} | ContextSource | SCR-001, SCR-004 |
| DELETE | /api/projects/[slug]/sources/[id] | auth | — | 204 | SCR-004 |
| POST | /api/projects/[slug]/sources/[id]/sync | auth | — | JobRun(CONTEXT_SYNC) | SCR-004 |
| GET | /api/projects/[slug]/cards | auth | ?status=&channel=&language= | FeedCard[] (最新Draft+QualityReview込み) | SCR-010 |
| GET | /api/projects/[slug]/cards/[id] | auth | — | FeedCard+Draft[]+sourceRef | SCR-010 |
| POST | /api/projects/[slug]/cards | auth | {channel, type, seed} (Site画面のCreate fix / チャットのAdd to feed) | FeedCard | SCR-005, SCR-011 |
| PATCH | /api/projects/[slug]/cards/[id]/draft | auth | {content} | Draft (authorType=HUMAN, version+1) | SCR-010 |
| POST | /api/projects/[slug]/cards/[id]/regenerate | auth | — | Draft (品質ゲート込み) | SCR-010 |
| POST | /api/projects/[slug]/cards/[id]/publish | auth | {method: API_X\|CMS\|GITHUB_PR} | PublishRecord (utm自動付与) / 失敗時422+理由 | SCR-010 |
| POST | /api/projects/[slug]/cards/[id]/done | auth | {externalUrl?} | PublishRecord(method=MANUAL) or カードDONE | SCR-010 |
| POST | /api/projects/[slug]/cards/[id]/archive | auth | {reason: inaccurate\|off_voice\|not_needed} | FeedCard(ARCHIVED) | SCR-010 |
| GET | /api/projects/[slug]/audits | auth | ?kind=SEO\|GEO | SiteAudit(最新)+履歴スコア | SCR-005 |
| GET | /api/projects/[slug]/performance | auth | ?period=7d\|28d\|90d | {funnel, byChannel[], records[]} | SCR-009 |
| PATCH | /api/projects/[slug]/publish-records/[id] | auth | {externalUrl} | PublishRecord (手動配信のURL後付け) | SCR-009, SCR-010 |
| GET | /api/projects/[slug]/reviews | auth | — | WeeklyReview[] | SCR-009 |
| PATCH | /api/projects/[slug]/reviews/[id] | auth | {learnings} | WeeklyReview | SCR-009 |
| GET | /api/projects/[slug]/agents | auth | — | AgentConfig[] | SCR-012 |
| PATCH | /api/projects/[slug]/agents/[channel] | auth | {enabled?, dailyQuota?, instructions?, config?} | AgentConfig | SCR-012 |
| GET | /api/projects/[slug]/integrations | auth | — | Integration[] (トークンは返さない) | SCR-014 |
| GET | /api/integrations/x/authorize | auth | ?project= | 302 → X OAuth | SCR-014 |
| GET | /api/integrations/x/callback | auth | code | 302 → SCR-014 (CONNECTED) | SCR-014 |
| GET | /api/integrations/github/install | auth | ?project= | 302 → GitHub App | SCR-014 |
| POST | /api/integrations/github/webhook | public(署名検証) | GitHub events | 200 | — |
| GET | /api/integrations/google/authorize | auth | ?project=&kind=GSC\|GA | 302 → Google OAuth | SCR-014 |
| GET | /api/integrations/google/callback | auth | code | 302 → SCR-014 | SCR-014 |
| PUT | /api/projects/[slug]/integrations/cms | auth | {webhookUrl, secret, fieldMapping} | Integration | SCR-014 |
| PUT | /api/projects/[slug]/integrations/notify | auth | {kind: SLACK_WEBHOOK\|TELEGRAM_BOT, config} | Integration | SCR-012 |
| POST | /api/projects/[slug]/integrations/notify/test | auth | {kind} | 200/502 | SCR-012 |
| DELETE | /api/projects/[slug]/integrations/[kind] | auth | — | 204 | SCR-014 |
| GET | /api/projects/[slug]/threads | auth | — | ChatThread[] | SCR-011 |
| POST | /api/projects/[slug]/threads | auth | {title?} | ChatThread | SCR-011 |
| POST | /api/projects/[slug]/threads/[id]/messages | auth | {content, contextRefs?} | SSE stream (assistant応答) | SCR-011 |

## 内部ジョブ (cron/worker — APIではないが契約として明記)

| Job | Schedule | 処理 |
|---|---|---|
| DAILY_CYCLE | 設定間隔(既定6h) | 有効AgentConfigごとに dailyQuota 分のカード生成(AIF-003〜007)→品質ゲート(AIF-008)→通知(Slack/Telegram設定時) |
| AUDIT | 24h | SEO/GEO監査(AIF-005) |
| METRIC_PULL | 8h | GSC/GA/X指標取り込み+PublishRecordへのOutcomeMetric紐付け |
| CONTEXT_SYNC | 24h+手動 | ソース再取得→変化検知→Foundation Doc更新提案(AIF-001) |
| WEEKLY_REVIEW | 週1(月曜朝) | 成果分析→WeeklyReview+learnings生成(AIF-009) |

## MCP Server (teardown §7-9 — Okaraに無い開放性)

stdio/HTTP両対応。Claude Code等から操作可能にする。MVPで公開するツール:

| Tool | 対応API |
|---|---|
| wasabi_list_cards | GET /cards |
| wasabi_get_card | GET /cards/[id] |
| wasabi_edit_draft | PATCH /cards/[id]/draft |
| wasabi_publish_card | POST /cards/[id]/publish |
| wasabi_archive_card | POST /cards/[id]/archive |
| wasabi_get_docs / wasabi_update_doc | GET/PATCH /docs |
| wasabi_get_performance | GET /performance |
| wasabi_run_job | POST /jobs |
| wasabi_chat | POST /threads/[id]/messages |
