import { NextResponse } from "next/server";
import { requireUser, CAT_COOKIE } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/** 選択中の猫を cookie に保存する。自分の猫かどうかは RLS 越しの再取得で検証。 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await req.json().catch(() => null);
  const catId = Number(body?.cat_id);

  if (!Number.isFinite(catId) || catId <= 0) {
    return NextResponse.json({ error: "cat_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cats")
    .select("id, name")
    .eq("id", catId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "cat not found" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, data });
  res.cookies.set(CAT_COOKIE, String(catId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
