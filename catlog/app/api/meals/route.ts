import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type MealItemIn = {
  dt: string;
  food_id: number | string | null;
  grams: number | string | null;
  kcal: number | string | null;
  note?: string | null;
  kcal_per_g_snapshot?: number | string | null;
  leftover_g?: number | string | null;
};

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = (await req.json()) as MealItemIn;

  const dt = String((body as any).dt ?? "");
  const food_id =
    (body as any).food_id === "" || (body as any).food_id == null ? null : Number((body as any).food_id);

  const grams = (body as any).grams == null || (body as any).grams === "" ? null : Number((body as any).grams);
  const kcal = (body as any).kcal == null || (body as any).kcal === "" ? null : Number((body as any).kcal);

  const note = (body as any).note == null ? null : String((body as any).note);

  const kcal_per_g_snapshot =
    (body as any).kcal_per_g_snapshot == null || (body as any).kcal_per_g_snapshot === ""
      ? null
      : Number((body as any).kcal_per_g_snapshot);

  const leftover_g =
    (body as any).leftover_g == null || (body as any).leftover_g === "" ? null : Number((body as any).leftover_g);

  if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });
  if (food_id == null) return NextResponse.json({ error: "food_id is required" }, { status: 400 });

  const ins: any = { dt, food_id, grams, kcal, note };
  if (kcal_per_g_snapshot != null) ins.kcal_per_g_snapshot = kcal_per_g_snapshot;
  if (leftover_g != null) ins.leftover_g = leftover_g;

  const { data, error } = await supabase
    .from("cat_meals")
    .insert(ins)
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const food_name = (data as any)?.cat_foods?.[0]?.food_name ?? null;

  return NextResponse.json({
    id: (data as any).id,
    dt: (data as any).dt,
    food_id: (data as any).food_id,
    food_name,
    grams: (data as any).grams,
    kcal: (data as any).kcal,
    note: (data as any).note,
    kcal_per_g_snapshot: (data as any).kcal_per_g_snapshot ?? null,
    leftover_g: (data as any).leftover_g ?? null,
  });
}
