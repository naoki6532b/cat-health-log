import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * サーバー側(API Route / Server Component)用の Supabase クライアント。
 * anonキー + ログインユーザーのcookieセッションで動くため、
 * すべてのクエリに RLS(自分の家族のデータのみ)が適用される。
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component からは cookie を書けない(セッション更新は middleware が行う)
          }
        },
      },
    }
  );
}
