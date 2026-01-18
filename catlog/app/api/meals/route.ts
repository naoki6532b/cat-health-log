import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";

export const dynamic = "force-dynamic";

type MealIn = {
  dt?: string;
  food_id?: number | string | null;
  grams?: number | string | null;
  kcal?: number | string | null;
  note?: string | null;
  leftover_g?: number | string | null;
};

function pickFoodName(cat_foods: any): string | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0]?.food_name ?? null;
  return cat_foods.food_name ?? null;
}

function numOrNull(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("cat_meals")
    .select(
      "id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,meal_group_id,cat_foods(food_name)"
    )
    .order("dt", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = (data ?? []).map((r: any) => {
    const { net_grams, net_kcal } = calcNet(r);
    return {
      id: r.id,
      dt: r.dt,
      meal_group_id: r.meal_group_id,
      food_id: r.food_id,
      food_name: pickFoodName(r.cat_foods),
      grams: r.grams,
      kcal: r.kcal,
      kcal_per_g_snapshot: r.kcal_per_g_snapshot,
      leftover_g: r.leftover_g ?? 0,
      net_grams,
      net_kcal,
      note: r.note,
    };
  });

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as MealIn | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const dt = String(body.dt ?? "");
  if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });

  const food_id = numOrNull(body.food_id);
  if (food_id == null) return NextResponse.json({ error: "food_id is required" }, { status: 400 });

  // grams は NOT NULL（型も number 必須）
  const grams = numOrNull(body.grams);
  if (grams == null || grams <= 0) {
    return NextResponse.json({ error: "grams is required" }, { status: 400 });
  }

  const kcal_in = numOrNull(body.kcal);
  const note = body.note == null || body.note === "" ? null : String(body.note);

  // leftover_g は 0..grams に丸める（DB制約に合わせる）
  const leftoverRaw = numOrNull(body.leftover_g);
  const leftover_g = clamp(leftoverRaw ?? 0, 0, grams);

  // food から kcal_per_g を取って snapshot を埋める
  const { data: food, error: foodErr } = await supabase
    .from("cat_foods")
    .select("food_name,kcal_per_g")
    .eq("id", food_id)
    .single();

  if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });

  const kcal_per_g_snapshot = Number(food?.kcal_per_g ?? NaN);
  if (!Number.isFinite(kcal_per_g_snapshot)) {
    return NextResponse.json({ error: "kcal_per_g is invalid for the selected food" }, { status: 500 });
  }

  // kcal は「置いた分」。未入力なら計算して必ず number にする（NOT NULL）
  const kcal = kcal_in != null ? kcal_in : Number((grams * kcal_per_g_snapshot).toFixed(3));
  if (!Number.isFinite(kcal)) {
    return NextResponse.json({ error: "kcal is invalid" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cat_meals")
    .insert({
      dt,
      food_id,
      grams,
      kcal,
      note,
      kcal_per_g_snapshot,
      leftover_g,
    })
    .select(
      "id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,meal_group_id,cat_foods(food_name)"
    )
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
