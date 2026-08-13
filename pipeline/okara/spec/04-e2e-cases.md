# 04 — E2E Test Cases (Wasabi)

P0 = MVP完了の必須条件(Stage 3 build は P0 全通過まで完了扱いにしない)。
外部API(X/GitHub/Google/LLM)はE2E環境ではモックサーバーに差し替え可能な設計とする(実配信はステージング手動確認)。

## E2E-001: ログイン
- screens: [SCR-021, SCR-003]
- steps:
  1. Given 未認証ユーザーが / にアクセスする
  2. When /login にリダイレクトされ、正しいemail/passwordを入力してSign inを押す
  3. Then ダッシュボード(またはプロジェクト未作成なら /projects/new)に遷移する
  4. When 誤ったパスワードで再試行する
  5. Then 「Invalid email or password」が表示され、遷移しない
- priority: P0

## E2E-002: プロジェクト作成→解析→Foundation Docs生成
- screens: [SCR-001, SCR-002, SCR-003, SCR-004]
- steps:
  1. Given ログイン済みで /projects/new を開く
  2. When URL(モックサイト)・名前・phase=Pre-launch・言語en+jaを入力しStart analysisを押す
  3. Then SCR-002 に遷移し、ターミナルログがストリーム表示される
  4. Then 5分以内に完了し、SCR-003 に自動遷移する
  5. When SCR-004 を開く
  6. Then Foundation Docs 5種(Product Description/Product Info/Strategy/Competitor/Brand Voice)が全て生成済みで、内容にモックサイトの固有情報(製品名・価格)が含まれる
- priority: P0

## E2E-003: Foundation Doc編集が次サイクルに反映される
- screens: [SCR-004, SCR-010]
- steps:
  1. Given 解析済みプロジェクトで SCR-004 の Brand Voice を開く
  2. When 「絶対に使わない語: revolutionary」を追記してSaveする
  3. Then バージョンが+1され、「次の生成サイクルから反映」トーストが出る
  4. When DAILY_CYCLE を手動実行し、SCR-010 で新規Xカードを開く
  5. Then 生成されたドラフト本文に "revolutionary" が含まれない(品質ゲートのvoiceScore検証項目)
- priority: P0

## E2E-004: 日次サイクルがカードを生成する
- screens: [SCR-003, SCR-010]
- steps:
  1. Given X/Reddit/SEO_GEO/Article/Launch の5チャンネルが有効(quota計7)
  2. When SCR-003 で Run now を押す
  3. Then ActivityStream に DAILY_CYCLE(RUNNING→SUCCESS)が表示される
  4. Then SCR-010 の Current に各チャンネルのカードが quota どおり生成され、priority/difficulty/品質スコア/言語バッジが付いている
  5. Then 各カードに rationale(なぜこの機会か)が表示される
- priority: P0

## E2E-005: Xカードの承認・投稿(接続済み)
- screens: [SCR-010]
- steps:
  1. Given X OAuth 接続済み(モック)で Current にXカードがある
  2. When カードを展開し Post now を押す
  3. Then X API(モック)に投稿され、カードが PUBLISHED タブへ移動し、投稿URLが表示される
  4. Then PublishRecord に utm(リンク含む投稿の場合)と method=API_X が記録される
- priority: P0

## E2E-006: Xカードの編集→投稿(編集が学習素材として保存される)
- screens: [SCR-010]
- steps:
  1. Given Current にXカードがある
  2. When 本文を編集して保存し、Post now を押す
  3. Then Draft に authorType=HUMAN の新バージョンが記録され、投稿は編集後の本文で行われる
- priority: P0

## E2E-007: Redditカードの手動投稿フロー
- screens: [SCR-010]
- steps:
  1. Given Current にRedditカード(元スレッドembed+返信ドラフト+subredditルール要旨付き)がある
  2. When Copy reply を押す
  3. Then クリップボードにコピーされ「Mark as done?」プロンプトが出る
  4. When Mark as done を押し、投稿URLを貼って確定する
  5. Then カードが DONE へ移動し、PublishRecord(method=MANUAL, externalUrl)が記録される
  6. And 自動投稿ボタンがこの画面のどこにも存在しない(BAN回避原則)
- priority: P0

## E2E-008: SEO fix → GitHub PR
- screens: [SCR-005, SCR-010]
- steps:
  1. Given GitHub App 接続済み(モック)で、SCR-005 に「llms.txt not found」Issueがある
  2. When Create fix を押す
  3. Then SEO_GEOカードが生成され SCR-010 に現れる(diffプレビュー付き)
  4. When Create PR を押す
  5. Then GitHub(モック)にPRが作成され、カードにPR URLが表示され PUBLISHED へ移動する
  6. And 自動マージは行われない
- priority: P0

## E2E-009: 記事カード→CMS公開
- screens: [SCR-010]
- steps:
  1. Given CMS webhook 設定済み(モック)で Current に記事カード(800語以上、targetKeyword付き)がある
  2. When プレビューを確認し Publish to CMS を押す
  3. Then webhook(モック)に title/body/slug/og が fieldMapping どおり送信され、カードが PUBLISHED になる
  4. When CMS未設定のプロジェクトで同操作をする
  5. Then Export(Markdownダウンロード)のみ表示され、Publishボタンは出ない
- priority: P0

## E2E-010: 品質ゲートが低品質ドラフトを止める
- screens: [SCR-010, SCR-003]
- steps:
  1. Given 品質ゲートの閾値(passed=false)を返すモックドラフトを生成させる(テスト用シード)
  2. When DAILY_CYCLE が実行される
  3. Then 不合格ドラフトは自動リライト(AGENT_FIX)され、合格版のみフィードに出る
  4. Given 3回連続不合格のケース
  5. Then カードはフィードに出ず、SCR-003 Activity に「dropped (quality)」が記録される
- priority: P0

## E2E-011: UTM付与と成果表示
- screens: [SCR-010, SCR-009]
- steps:
  1. Given リンクを含む記事カードを CMS 公開済み、METRIC_PULL(モック指標)実行済み
  2. When SCR-009 を開く
  3. Then ファネル(配信→imp→クリック)に当該記事が集計され、個別配信成績テーブルに imp/clicks が表示される
  4. And 公開されたリンクに utm_campaign=カードID が付与されている
- priority: P0

## E2E-012: 週次振り返り生成と学習の反映
- screens: [SCR-009, SCR-010]
- steps:
  1. Given 7日分の PublishRecord+OutcomeMetric(モック: 特定カテゴリのツイートが高CTR)がある
  2. When Generate review を押す
  3. Then WeeklyReview が生成され、「効いた角度」への言及が learnings に構造化される
  4. When 次の DAILY_CYCLE を実行し、新Xカードの rationale を確認する
  5. Then rationale に learnings への参照が含まれる
- priority: P0

## E2E-013: CMOチャット(コンテキスト参照付き)
- screens: [SCR-011]
- steps:
  1. Given 解析済みプロジェクトで SCR-011 を開く
  2. When 「@strategy 今週の最優先チャネルは?」と送信する
  3. Then ストリーミング応答が返り、応答に Marketing Strategy 参照チップが表示される
  4. When 「明日のツイートを1案作って」と送信し、応答内の Add to feed を押す
  5. Then Xカードが作成され SCR-010 に現れる
- priority: P0

## E2E-014: カードのアーカイブ(理由付き)
- screens: [SCR-010]
- steps:
  1. Given Current にカードがある
  2. When Archive を押し、理由「トーン不一致」を選ぶ
  3. Then カードが Archived タブへ移動し、理由が記録される
- priority: P0

## E2E-015: ローンチカード(HN/Product Hunt)
- screens: [SCR-010]
- steps:
  1. Given phase=Pre-launch のプロジェクトで DAILY_CYCLE 実行済み
  2. When SCR-010 で Launch チャンネルのカードを開く
  3. Then Show HN タイトル+本文の複数バリエーション、または PH ローンチ素材が表示され、推奨投稿時刻ガイダンスが付いている
  4. And ハイプ語(revolutionary/game-changing/AI-powered)が本文に含まれない
  5. When Copy → Mark as done でURLを登録する
  6. Then DONE へ移動し成果計測対象になる
- priority: P0

## E2E-016: 統合の接続・失効・フォールバック
- screens: [SCR-014, SCR-010]
- steps:
  1. Given X 未接続
  2. Then SCR-010 のXカードには Post now が無く Copy のみ表示される
  3. When SCR-014 で X を接続(モックOAuth)する
  4. Then Post now が表示される
  5. When トークンを失効させ(モック)、Post now を押す
  6. Then カードに「X token expired」エラーが出て CURRENT に留まり、SCR-014 に ⚠ Reconnect が表示される
- priority: P0

## E2E-017: 日英2言語生成
- screens: [SCR-012, SCR-010]
- steps:
  1. Given languages=[en, ja] のプロジェクト
  2. When DAILY_CYCLE を実行する
  3. Then Xカードに en と ja のカードが両方生成され、ja版は en の翻訳ではなく独立した自然な日本語である(品質ゲートで機械翻訳調を検査)
  4. When SCR-010 の language フィルタで ja を選ぶ
  5. Then jaカードのみ表示される
- priority: P1

## E2E-018: Living Context 同期→更新提案
- screens: [SCR-004]
- steps:
  1. Given WEBSITE ソースのモックサイトの価格を変更する
  2. When Sync を押す
  3. Then 変化が検知され、Product Info に「Update suggested」バッジが付く
  4. When diff を確認し Accept する
  5. Then 文書が更新され、人間が以前編集した箇所は保持されている
- priority: P1

## E2E-019: 通知(Slack/Telegram)
- screens: [SCR-012]
- steps:
  1. Given Slack webhook 設定済み(モック)
  2. When DAILY_CYCLE が完了する
  3. Then モックwebhookに「N cards ready」通知が届き、リンクが SCR-010 を指す
- priority: P1

## E2E-020: マルチプロジェクト
- screens: [SCR-001, SCR-003]
- steps:
  1. Given プロジェクトが1つ存在する
  2. When ProjectSwitcher から New project で2つ目を作成する
  3. Then 各プロジェクトの Feed/Docs/設定が完全に分離されている
- priority: P1

## E2E-021: MCPサーバー経由の操作
- screens: [—(ヘッドレス)]
- steps:
  1. Given MCPクライアント(テストハーネス)が接続する
  2. When wasabi_list_cards → wasabi_edit_draft → wasabi_publish_card を順に呼ぶ
  3. Then Web UIと同一の結果(Draft HUMAN版作成、PublishRecord記録)になる
- priority: P1

---
- P0: 16件(E2E-001〜016) / P1: 5件(E2E-017〜021)
- P0一筆書き検証: E2E-001(ログイン)→ E2E-002(作成・解析)→ E2E-004(生成)→ E2E-005/007/008/009(各チャネル配信)→ E2E-011(成果)→ E2E-012(学習)で「登録→コア価値(生成→配信→学習)」が繋がる。課金導線は internal-first のため対象外 [USER-REQ]
