import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

type FoodRow = {
  id: number;
  food_name: string | null;
  kcal_per_g: number | null;
};

type MealOut = {
  id: number;
  dt: string;
  food_id: number | null;
  food_name: string | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
  kcal_per_g_snapshot: number;
  leftover_g: number;
};

function numOrNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampLimit(v: unknown, def = 200) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(500, Math.max(1, Math.trunc(n)));
}

function pickFoodName(embed: any): string | null {
  const cf = Array.isArray(embed) ? embed[0] : embed;
  return (cf?.food_name ?? null) as string | null;
}

export async function GET(req: NextRequest) {
  if (!checkPin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();

  const { searchParams } = new URL(req.url);
  const limit = clampLimit(searchParams.get("limit"), 200);

  const { data, error } = await supabase
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];

  const out: MealOut[] = rows.map((r) => ({
    id: r.id,
    dt: r.dt,
    food_id: r.food_id ?? null,
    food_name: pickFoodName(r.cat_foods),
    grams: r.grams ?? null,
    kcal: r.kcal ?? null,
    note: r.note ?? null,
    kcal_per_g_snapshot: Number(r.kcal_per_g_snapshot ?? 0),
    leftover_g: Number(r.leftover_g ?? 0),
  }));

  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  if (!checkPin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const dt = String(body?.dt ?? "").trim();
  const food_id = numOrNull(body?.food_id);

  // ★ NOT NULL 対策：food_id が無いと snapshot 取れないので 400
  if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });
  if (food_id == null) return NextResponse.json({ error: "food_id is required" }, { status: 400 });

  let grams = numOrNull(body?.grams);
  let kcal = numOrNull(body?.kcal);
  const note = body?.note == null || body?.note === "" ? null : String(body.note);

  // フードの kcal_per_g を取得して snapshot に保存する
  const { data: food, error: foodErr } = await supabase
    .from("cat_foods")
    .select("id,food_name,kcal_per_g")
    .eq("id", food_id)
    .single();

  if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });

  const f = food as unknown as FoodRow;
  const kpg = Number(f?.kcal_per_g);

  if (!Number.isFinite(kpg) || kpg <= 0) {
    return NextResponse.json(
      { error: "kcal_per_g is missing for this food. Please set it in Foods." },
      { status: 400 }
    );
  }

  // grams/kcal 片方だけ入力でも計算できるように（UI側の挙動と整合）
  if (grams != null && kcal == null) kcal = Math.round(grams * kpg * 10) / 10;
  if (kcal != null && grams == null) grams = Math.round((kcal / kpg) * 10) / 10;

  const insertRow = {
    dt,
    food_id,
    grams,
    kcal,
    note,
    kcal_per_g_snapshot: kpg, // ★ここが必須
    leftover_g: 0,            // テーブルにある前提（無ければ削ってOK）
  };

  const { data, error } = await supabase
    .from("cat_meals")
    .insert(insertRow)
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const r: any = data;
  return NextResponse.json({
    id: r.id,
    dt: r.dt,
    food_id: r.food_id ?? null,
    food_name: pickFoodName(r.cat_foods) ?? f.food_name ?? null,
    grams: r.grams ?? null,
    kcal: r.kcal ?? null,
    note: r.note ?? null,
    kcal_per_g_snapshot: Number(r.kcal_per_g_snapshot ?? kpg),
    leftover_g: Number(r.leftover_g ?? 0),
  });
}
