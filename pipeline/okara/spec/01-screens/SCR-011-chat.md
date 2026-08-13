# SCR-011: CMO Chat
- route: /projects/[slug]/chat
- auth: authenticated
- purpose: 対話ハブ。戦略相談・アドホック生成・毎朝のdaily rundown(Okara Talk to AI CMO 同等+コンテキスト参照の透明化)

## Layout
```
+---------+----------------------------------------+
| Threads |  Daily rundown (毎朝自動投下)            |
| + New   |  user: @strategy 今週Redditどこ攻める?   |
|  今日    |  cmo: (Marketing Strategy v12 と        |
|  8/12   |       learnings を参照して回答...)        |
|         |  [ Ask me anything...        ] [@] [送信] |
+---------+----------------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| ThreadList | スレッド一覧+New chat | ChatThread |
| MessageList | Markdown表示。assistant応答には「参照したコンテキスト」チップ(クリックで該当文書/画面へ) | ChatMessage.contextRefs |
| ComposerInput | @メンションでコンテキストピル挿入(docs 5種 / feed / site / performance / sources) | — |
| DailyRundown | DAILY_CYCLE 完了時に自動生成される朝のサマリーメッセージ(今日のカード・スコア変化・注目機会) | ChatMessage(自動) |

## States
- loading: 応答ストリーミング表示
- empty: スレッドなし → daily rundown の説明+入力欄
- error: 生成失敗 → メッセージ位置に「Failed. [Retry]」

## Interactions
- 送信 → ストリーミング応答。応答内でカード生成を提案された場合「Add to feed」ボタン → FeedCard 作成 → SCR-010
- @メンション → コンテキスト選択ポップアップ
- コンテキストチップクリック → SCR-004/005/009/010 へ遷移

## AI Behaviors
- AIF-011: Foundation Docs+learnings+直近指標を常時システムコンテキストに持つCMOエージェント。アドホック生成(「明日のツイート3案」等)はチャット内カードとして返し、Add to feed できる
- fallback: モデル呼び出し失敗時は自動リトライ1回→失敗メッセージ表示(入力は保持)
