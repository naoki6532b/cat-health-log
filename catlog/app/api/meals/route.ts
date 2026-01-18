import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type MealItemIn = {
  dt: string;
  food_id: number | string;
  grams: number | string;
  kcal: number | string;
  note?: string | null;
  leftover_g?: number | string | null;
};

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();

  const body = (await req.json()) as Partial<MealItemIn>;

  const dt = String(body.dt ?? "");
  const food_id = Number(body.food_id);
  const grams = Number(body.grams);
  const kcal = Number(body.kcal);
  const note = body.note == null ? null : String(body.note);
  const leftover_g = body.leftover_g == null ? 0 : Number(body.leftover_g);

  if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });
  if (!Number.isFinite(food_id)) return NextResponse.json({ error: "food_id is required" }, { status: 400 });
  if (!Number.isFinite(grams) || grams <= 0) return NextResponse.json({ error: "grams is invalid" }, { status: 400 });
  if (!Number.isFinite(kcal) || kcal < 0) return NextResponse.json({ error: "kcal is invalid" }, { status: 400 });

  // ★ NOT NULL 対策：kcal_per_g_snapshot を cat_foods から取得
  const { data: food, error: foodErr } = await supabase
    .from("cat_foods")
    .select("kcal_per_g, food_name")
    .eq("id", food_id)
    .single();

  if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });

  const kcal_per_g_snapshot = Number(food?.kcal_per_g);
  if (!Number.isFinite(kcal_per_g_snapshot)) {
    return NextResponse.json({ error: "kcal_per_g_snapshot is invalid (food kcal_per_g missing)" }, { status: 500 });
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
      leftover_g: Number.isFinite(leftover_g) ? leftover_g : 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data?.id });
}
