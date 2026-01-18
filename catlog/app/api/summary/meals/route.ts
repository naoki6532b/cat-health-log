import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";

export const dynamic = "force-dynamic";

type Row = {
  dt: string;
  grams: number;
  kcal: number;
  leftover_g: number;
  kcal_per_g_snapshot: number;
  cat_foods: { food_name: string }[] | { food_name: string } | null;
};

function pickFoodName(cf: Row["cat_foods"]): string {
  if (!cf) return "";
  if (Array.isArray(cf)) return cf[0]?.food_name ?? "";
  return cf.food_name ?? "";
}

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  // 直近30日（必要なら days= で変えられるようにしてもOK）
  const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("dt, grams, kcal, leftover_g, kcal_per_g_snapshot, cat_foods(food_name)")
    .gte("dt", from)
    .order("dt", { ascending: true })
    .returns<Row[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => {
    const grams = Number(r.grams ?? 0);
    const kcal = Number(r.kcal ?? 0);
    const leftover_g = Number(r.leftover_g ?? 0);
    const snap = Number(r.kcal_per_g_snapshot ?? 0);

    const net_grams = Math.max(0, grams - leftover_g);
    const net_kcal = Number.isFinite(snap)
      ? Math.max(0, kcal - leftover_g * snap)
      : kcal;

    return {
      dt: r.dt,
      food_name: pickFoodName(r.cat_foods),
      grams,
      kcal,
      leftover_g,
      net_grams,
      net_kcal: Math.round(net_kcal * 10) / 10, // 見やすく0.1kcal
    };
  });

  return NextResponse.json(rows);
}
