# cat-health-log

家族で共有できる猫の健康記録アプリ(Next.js + Supabase)。

- 認証: Supabase Auth(メール+パスワード)。家族で1アカウントを共有する想定
- 複数の猫を登録可能。1匹だけなら猫選択はスキップされる
- データは RLS(Row Level Security)でアカウントごとに完全分離

## セットアップ(認証移行後の初回デプロイ手順)

1. **アカウント作成**: Supabase ダッシュボード → Authentication → Users → Add user で
   家族アカウント(例: naoki6532@gmail.com)を作成する。
   パスワードは **6文字以上**。「Auto Confirm User」にチェックを入れる。
2. **マイグレーション適用**: `supabase/migrations/20260703000000_family_accounts_multi_cat.sql` を
   SQL Editor で実行する(または `supabase db push`)。
   既存データはこのアカウントの猫「マフユ」に紐づく。
3. **環境変数(Vercel)**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`(ストレージ操作のみに使用)
   - `CATLOG_PIN` / `NEXT_PUBLIC_CATLOG_PIN` は**削除する**(PIN方式は廃止)
4. **メール確認の設定(任意)**: 新規登録を即時有効にするなら
   Authentication → Sign In / Up → 「Confirm email」をオフにする。

## 開発

```bash
cd catlog
npm install
npm run dev
```

`.env.local` に上記の環境変数を設定すること(コミットしない)。
