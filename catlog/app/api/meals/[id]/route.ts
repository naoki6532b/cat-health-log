import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export const dynamic = "force-dynamic";

// Next.js 16 の App Router: params は Promise
type RouteCtx = { params: Promise<{ id: string }> };

function parseId(raw: unknown) {
  const s = String(raw ?? "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function getId(req: Request, ctx?: RouteCtx) {
  // 1) ctx.params から
  try {
    if (ctx?.params) {
      const p = await ctx.params;
      const n = parseId(p?.id);
      if (n != null) return n;
    }
  } catch {
    // ignore
  }

  // 2) URLの末尾から
  try {
    const u = new URL(req.url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    const n = parseId(last);
    if (n != null) return n;
  } catch {
    // ignore
  }

  return null;
}

function pickFoodName(cat_foods: any): string | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0]?.food_name ?? null;
  return cat_foods.food_name ?? null;
}

function calcNet(r: any) {
  const grams = Number(r.grams ?? 0);
  const leftover_g = Number(r.leftover_g ?? 0);
  const snap = Number(r.kcal_per_g_snapshot ?? 0);

  const net_grams = Math.max(0, grams - leftover_g);
  const net_kcal =
    r.kcal != null && Number.isFinite(snap)
      ? Number((Number(r.kcal) - leftover_g * snap).toFixed(3))
      : r.kcal;

  return { net_grams, net_kcal };
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();
  const id = await getId(req, ctx);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { data, error } = await supabase
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,meal_group_id,cat_foods(food_name)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const r: any = data;
  const { net_grams, net_kcal } = calcNet(r);

  return NextResponse.json({
    id: r.id,
    dt: r.dt,
    meal_group_id: r.meal_group_id,
    food_id: r.food_id,
    food_name: pickFoodName(r.cat_foods),
    grams: r.grams,
    kcal: r.kcal,
    note: r.note,
    kcal_per_g_snapshot: r.kcal_per_g_snapshot,
    leftover_g: r.leftover_g ?? 0,
    net_grams,
    net_kcal,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();
  const id = await getId(req, ctx);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as any;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const patch: any = {};

  if (body.dt !== undefined) patch.dt = body.dt;
  if (body.note !== undefined) patch.note = body.note === "" ? null : String(body.note);
  if (body.leftover_g !== undefined) {
    patch.leftover_g = body.leftover_g == null || body.leftover_g === "" ? 0 : Number(body.leftover_g);
  }

  const grams = body.grams !== undefined ? (body.grams == null || body.grams === "" ? null : Number(body.grams)) : undefined;
  const kcal_in = body.kcal !== undefined ? (body.kcal == null || body.kcal === "" ? null : Number(body.kcal)) : undefined;
  const food_id = body.food_id !== undefined ? (body.food_id == null || body.food_id === "" ? null : Number(body.food_id)) : undefined;

  if (grams !== undefined) patch.grams = grams;
  if (kcal_in !== undefined) patch.kcal = kcal_in;
  if (food_id !== undefined) patch.food_id = food_id;

  // food_id が変わるなら snapshot を更新
  if (food_id !== undefined) {
    if (food_id == null || !Number.isFinite(food_id)) {
      return NextResponse.json({ error: "food_id is invalid" }, { status: 400 });
    }
    const { data: food, error: foodErr } = await supabase
      .from("cat_foods")
      .select("kcal_per_g")
      .eq("id", food_id)
      .single();

    if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });

    const snap = Number(food?.kcal_per_g ?? NaN);
    if (!Number.isFinite(snap)) {
      return NextResponse.json({ error: "kcal_per_g is invalid for the selected food" }, { status: 500 });
    }
    patch.kcal_per_g_snapshot = snap;

    // kcal 未指定で grams があるなら再計算（置いた分）
    const gramsForCalc = grams !== undefined ? grams : undefined;
    if (kcal_in === undefined && gramsForCalc != null) {
      patch.kcal = Number((gramsForCalc * snap).toFixed(3));
    }
  }

  // food_id は変わらないが grams だけ変わって kcal 未指定なら、既存 snapshot を使って計算（置いた分）
  if (food_id === undefined && grams !== undefined && kcal_in === undefined && grams != null) {
    const { data: cur, error: curErr } = await supabase
      .from("cat_meals")
      .select("kcal_per_g_snapshot")
      .eq("id", id)
      .single();

    if (!curErr) {
      const snap = Number((cur as any)?.kcal_per_g_snapshot ?? NaN);
      if (Number.isFinite(snap)) {
        patch.kcal = Number((grams * snap).toFixed(3));
      }
    }
  }

  const { error } = await supabase.from("cat_meals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();
  const id = await getId(req, ctx);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { error } = await supabase.from("cat_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
