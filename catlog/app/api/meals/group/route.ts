import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";

export const dynamic = "force-dynamic";

function pickFoodName(cat_foods: any): string | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0]?.food_name ?? null;
  return cat_foods.food_name ?? null;
}

function parseId(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const url = new URL(req.url);
  const anchor_id = parseId(url.searchParams.get("anchor_id"));
  if (!anchor_id) {
    return NextResponse.json({ error: "anchor_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: anchor, error: aErr } = await supabase
    .from("cat_meals")
    .select("id,meal_group_id")
    .eq("id", anchor_id)
    .single();

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const groupId = (anchor as any)?.meal_group_id;
  if (!groupId) {
    return NextResponse.json({ error: "meal_group_id is missing" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("cat_meals")
    .select(
      "id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,meal_group_id,cat_foods(food_name)"
    )
    .eq("meal_group_id", groupId)
    .order("dt", { ascending: true })
    .order("id", { ascending: true });

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
