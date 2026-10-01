import { NextResponse } from "next/server";
import { requireCatContext } from "@/lib/serverAuth";
import { addDaysYmd, jstYmd } from "@/lib/calorieWarning";
import { normalizeRecentMealLogDays } from "@/lib/mealLogSettings";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  dt: string;
  food_id: number;
  grams: number;
  kcal: number;
  note: string | null;
  kcal_per_g_snapshot: number | null;
  leftover_g: number | null;
  meal_group_id: string;
  cat_foods: { food_name: string }[] | { food_name: string } | null;
};

function pickFoodName(cat_foods: Row["cat_foods"]): string | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0]?.food_name ?? null;
  return cat_foods.food_name ?? null;
}

function calcNet(r: Row) {
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

  // Fetch every row in the configured period despite the per-request row cap.
  const PAGE_SIZE = 1000;
  const collected: Row[] = [];
  const fromUtcIso = new Date(fromIso).toISOString();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cat_meals")
      .select(
        "id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,meal_group_id,cat_foods(food_name)"
      )
      .eq("cat_id", catId)
      .gte("dt", fromUtcIso)
      .order("dt", { ascending: false })
      // Keep pagination deterministic when timestamps match.
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .returns<Row[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const batch = data ?? [];
    collected.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  const out = collected.map((r) => {
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
