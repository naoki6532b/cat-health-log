import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";

/** 選択中の猫IDを保持する cookie 名 */
export const CAT_COOKIE = "catlog_cat_id";

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>;

export type UserContext = {
  supabase: SupabaseServer;
  user: User;
};

export type CatContext = UserContext & {
  catId: number;
};

/** APIルート用: ログインだけ要求する(猫の選択が不要な処理向け) */
export async function requireUser(): Promise<UserContext | NextResponse> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return { supabase, user };
}

/**
 * APIルート用: ログイン + 対象の猫を解決する。
 * - 未ログイン → 401
 * - 猫が未登録 → 409 { error: "no_cat" }
 * - 猫が複数いて未選択 → 409 { error: "cat_not_selected" }
 * - 猫が1匹だけなら自動選択(選択画面をスキップできる)
 *
 * cookie の猫IDは RLS 越しに引き直して検証するので、
 * 他人の猫IDを cookie に入れても通らない。
 */
export async function requireCatContext(): Promise<CatContext | NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const cookieStore = await cookies();
  const raw = cookieStore.get(CAT_COOKIE)?.value ?? "";
  let catId: number | null = /^\d+$/.test(raw) ? Number(raw) : null;

  if (catId != null) {
    const { data } = await supabase
      .from("cats")
      .select("id")
      .eq("id", catId)
      .maybeSingle();
    if (!data) catId = null;
  }

  if (catId == null) {
    const { data: cats, error } = await supabase
      .from("cats")
      .select("id")
      .order("id")
      .limit(2);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!cats || cats.length === 0) {
      return NextResponse.json({ error: "no_cat" }, { status: 409 });
    }
    if (cats.length > 1) {
      return NextResponse.json({ error: "cat_not_selected" }, { status: 409 });
    }
    catId = Number(cats[0].id);
  }

  return { supabase, user, catId };
}
