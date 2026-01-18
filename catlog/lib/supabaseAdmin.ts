import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let _admin: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // build時・型解析時に即死させない
  if (!url || !key) {
    throw new Error(
      "Missing Supabase admin env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  _admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _admin;
}

/**
 * ★ 重要
 * import時に初期化しないための遅延Proxy
 * build時に評価されても落ちなくなる
 */
export const supabaseAdmin: SupabaseClient<Database> = new Proxy({} as any, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    return (client as any)[prop];
  },
});
