import { NextResponse } from "next/server";
import { requireCatContext } from "@/lib/serverAuth";
import { addDaysYmd, jstYmd } from "@/lib/calorieWarning";
import { normalizeRecentMealLogDays } from "@/lib/mealLogSettings";

export const dynamic = "force-dynamic";

function pickFoodName(cat_foods: any): string | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0]?.food_name ?? null;
  return cat_foods.food_name ?? null;
}

function calcNet(r: any) {
  const grams = Number(r.grams ?? 0);
  const kcal = Number(r.kcal ?? 0);
  const leftover_g = Number(r.leftover_g ?? 0);
  const snap = Number(r.kcal_per_g_snapshot ?? 0);

  const net_grams = Math.max(0, grams - leftover_g);
  const net_kcal = Number.isFinite(snap)
    ? Number((kcal - leftover_g * snap).toFixed(3))
    : kcal;

  return { net_grams, net_kcal };
}

export async function GET() {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  const { data: cat, error: catError } = await supabase
    .from("cats")
    .select("recent_meal_log_days")
    .eq("id", catId)
    .single();

  if (catError) {
    return NextResponse.json({ error: catError.message }, { status: 500 });
  }

  const days = normalizeRecentMealLogDays(cat?.recent_meal_log_days);
  const todayYmd = jstYmd(new Date());
  const fromYmd = addDaysYmd(todayYmd, -(days - 1));
  const fromIso = `${fromYmd}T00:00:00+09:00`;

  const { data, error } = await supabase
    .from("cat_meals")
    .select(
      "id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,meal_group_id,cat_foods(food_name)"
    )
    .eq("cat_id", catId)
    .gte("dt", new Date(fromIso).toISOString())
    .order("dt", { ascending: false })
    .limit(1000);

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
      note: r.note ?? null,
    };
  });

  return NextResponse.json(out);
}
