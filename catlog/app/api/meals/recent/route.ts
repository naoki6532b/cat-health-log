import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export const dynamic = "force-dynamic";

type FoodRow = {
  food_name: string | null;
};

type Row = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
  kcal_per_g_snapshot: number;
  leftover_g: number | null;
  // supabaseのjoinは「object」だったり「array」だったりするので両対応
  cat_foods?: FoodRow | FoodRow[] | null;
};

function pickFoodName(v: Row["cat_foods"]): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0]?.food_name ?? null;
  return v.food_name ?? null;
}

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

  const { data, error } = await supabase
    .from("cat_meals")
    .select(
      "id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)"
    )
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];

  const out = rows.map((r) => ({
    id: r.id,
    dt: r.dt,
    food_id: r.food_id,
    food_name: pickFoodName(r.cat_foods),
    grams: r.grams,
    kcal: r.kcal,
    note: r.note,
    kcal_per_g_snapshot: r.kcal_per_g_snapshot,
    leftover_g: r.leftover_g,
  }));

  return NextResponse.json(out);
}
