# SCR-010: Agents Feed(中核画面)
- route: /projects/[slug]/feed
- auth: authenticated
- purpose: 日次生成カードの確認・編集・承認・配信(Okara Agents Feedの上位互換: 品質スコア表示+編集学習)

## Layout
```
+--------------------------------------------------+
| Tabs: [Current 5] [Done] [Published] [Archived]  |
| Filters: channel▼  language▼                     |
| ┌────────────────────────────────────┐           |
| │ [X] [HIGH] Tweet: Why memory isn't…│           |
| │ 品質 92 · en · 2h ago               │           |
| │ (展開時)                            │           |
| │  rationale: 今週のlearnings反映…     │           |
| │  [本文エディタ(編集可)]              │           |
| │  v2 (AGENT_FIX) · Quality: G88 F95 V94│         |
| │  [Post now] [Copy] [Regenerate] [Archive]│      |
| └────────────────────────────────────┘           |
| (Redditカード: 元スレッドembed+返信ドラフト+       |
|   [Copy reply] [Open thread ↗] [Mark as done])   |
| (seo_fixカード: diffプレビュー+[Create PR])        |
| (articleカード: プレビュー+[Publish to CMS][Export])|
+--------------------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| CardList | status別タブ。channel/language フィルタ。新着順 | FeedCard |
| CardHeader | channelアイコン、priority/difficultyバッジ、品質スコア、言語 | FeedCard, QualityReview |
| DraftEditor | 最新Draft表示・編集。編集保存で authorType=HUMAN の新バージョン作成(学習素材) | Draft |
| RationaleBlock | なぜこのカードか(元スレッド/キーワード/learnings参照) | FeedCard.rationale |
| ActionBar | カードtype別: Post now(X接続時)/ Copy / Publish to CMS / Create PR / Mark as done / Regenerate / Archive | — |
| SourceEmbed | Reddit: 元スレッド抜粋+subredditルール要旨。HN: 推奨投稿時刻 | FeedCard.sourceRef |
| ManualUrlPrompt | Mark as done 時に「投稿URLを貼ってください(成果計測用)」任意入力 | PublishRecord |

## States
- loading: スケルトン
- empty(Current): 「Next cycle at 15:00」+ Run now ボタン
- error: 配信失敗(X API等)→ カード上に赤バナー+Retry。カードは CURRENT に留まる
- success: Post/Publish後、カードが PUBLISHED タブへ移動+トースト

## Interactions
- Post now → X OAuth で即時投稿 → PublishRecord(method=API_X, utm自動付与) → PUBLISHED へ
- Copy → クリップボード+「Mark as done?」プロンプト
- Mark as done → URL入力(任意)→ DONE へ
- Create PR(seo_fix)→ GitHub PR 作成 → PRリンク表示 → PUBLISHED へ
- Publish to CMS(article)→ CMS_WEBHOOK で公開 → PUBLISHED へ
- Regenerate → 品質ゲート込みで再生成(新Draftバージョン)
- Archive → ARCHIVED へ(理由選択: 不正確/トーン不一致/不要 — 学習素材)

## AI Behaviors
- AIF-003/004/005/006/007: DAILY_CYCLE(6時間ごと)が channel別カードを dailyQuota 分生成。全ドラフトは AIF-008 品質ゲートを通過したもののみフィードに出る
- AIF-010: 人間編集(HUMAN draft)と Archive理由を蓄積し、ボイスプロファイル/生成方針を更新
- fallback: 品質ゲート3回不合格のドラフトはフィードに出さず、SCR-003 Activity に「1 card dropped (quality)」と記録
