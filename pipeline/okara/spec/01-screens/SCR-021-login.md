# SCR-021: Login
- route: /login
- auth: public
- purpose: 内部チームメンバーの認証(internal-first、環境変数プロビジョニング)

## Layout
```
+----------------------------------+
|            Wasabi ロゴ            |
|  [ Email          ]              |
|  [ Password       ]              |
|  [ Sign in ]                     |
+----------------------------------+
```

## Components
| Component | Behavior | Data |
|---|---|---|
| EmailInput | 必須、email形式バリデーション | — |
| PasswordInput | 必須 | — |
| SignInButton | NextAuth Credentials でサインイン | User |

## States
- loading: ボタンスピナー・二重送信防止
- error: 「Invalid email or password」をフォーム上部に表示
- success: 直前のURL or `/` (SCR-003 / プロジェクト未作成なら SCR-001) へリダイレクト

## Interactions
- Sign in 成功 → SCR-003 (プロジェクトなしなら SCR-001)
- 未認証で保護ルートへアクセス → 本画面へリダイレクト

## AI Behaviors
- none
