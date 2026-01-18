// catlog/lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

function mustGet(name: string, v: string | undefined) {
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

export function getSupabaseAdmin() {
  // URL はどれかに入ってればOKにする
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";

  // service role はこれ（タイポ注意）
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  mustGet("supabaseUrl", url);
  mustGet("SUPABASE_SERVICE_ROLE_KEY", serviceRole);

  return createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
}

// 既存コード互換用（もし他ファイルが supabaseAdmin を import しててもビルド落ちないように）
export const supabaseAdmin = getSupabaseAdmin();
