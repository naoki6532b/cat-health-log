import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ用クライアント。セッションを cookie に保存するので
 * サーバー側(API Route / middleware)と共有できる。
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
