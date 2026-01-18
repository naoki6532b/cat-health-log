import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export const dynamic = "force-dynamic";

type CatFoodsJoin =
  | { food_name?: string | null; name?: string | null }
  | { food_name?: string | null; name?: string | null }[]
  | null
  | undefined;

type Row = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
  kcal_per_g_snapshot?: number | null;
  leftover_g?: number | null;
  cat_foods?: CatFoodsJoin;
};

function pickFoodName(cat_foods: CatFoodsJoin): string | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) {
    const v = cat_foods[0]?.food_name ?? cat_foods[0]?.name ?? null;
    return v == null ? null : String(v);
  }
  const v = cat_foods.food_name ?? cat_foods.name ?? null;
  return v == null ? null : String(v);
}

export async function GET(req: Request) {
  if (!checkPin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));

  const { data, error } = await supabase
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];

  const out = rows.map((r) => ({
    id: r.id,
    dt: r.dt,
    food_id: r.food_id,
    food_name: pickFoodName(r.cat_foods) ?? null,
    grams: r.grams,
    kcal: r.kcal,
    note: r.note,
    kcal_per_g_snapshot: r.kcal_per_g_snapshot ?? null,
    leftover_g: r.leftover_g ?? null,
  }));

  return NextResponse.json(out);
}
