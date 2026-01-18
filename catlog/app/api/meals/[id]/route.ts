import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Next.js 16 の App Router: params は Promise で渡る
type RouteCtx = { params: Promise<{ id: string }> };

function parseId(raw: unknown) {
  const s = String(raw ?? "");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getIdFromUrl(req: Request): number | null {
  try {
    const pathname = new URL(req.url).pathname; // /api/meals/44
    const last = pathname.split("/").filter(Boolean).pop();
    return parseId(last);
  } catch {
    return null;
  }
}

async function getId(req: Request, ctx?: Partial<RouteCtx>): Promise<number | null> {
  // ctx.params が取れる時（本番ビルド想定）
  try {
    if (ctx?.params) {
      const p = await ctx.params;
      const id = parseId(p?.id);
      if (id) return id;
    }
  } catch {
    // 何もしないでURL fallbackへ
  }
  // fallback（devで稀に ctx が崩れた時の保険）
  return getIdFromUrl(req);
}

export async function GET(req: Request, ctx: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const id = await getId(req, ctx);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { data, error } = await supabase
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const id = await getId(req, ctx);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));

  const patch: any = {};

  if (body.dt != null) patch.dt = String(body.dt);
  if (body.grams != null) patch.grams = Number(body.grams);
  if (body.kcal != null) patch.kcal = Number(body.kcal);
  if (body.note !== undefined) patch.note = body.note == null ? null : String(body.note);
  if (body.leftover_g != null) patch.leftover_g = Number(body.leftover_g);

  // food_id を変えるなら snapshot も必ず更新
  if (body.food_id != null && body.food_id !== "") {
    const newFoodId = Number(body.food_id);
    patch.food_id = newFoodId;

    const { data: food, error: foodErr } = await supabase
      .from("cat_foods")
      .select("kcal_per_g")
      .eq("id", newFoodId)
      .single();

    if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });

    const snap = Number(food?.kcal_per_g);
    if (!Number.isFinite(snap)) {
      return NextResponse.json({ error: "kcal_per_g_snapshot is invalid (food kcal_per_g missing)" }, { status: 500 });
    }
    patch.kcal_per_g_snapshot = snap;
  }

  const { error } = await supabase.from("cat_meals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const id = await getId(req, ctx);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { error } = await supabase.from("cat_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
