import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export const dynamic = "force-dynamic";

function pickFoodName(embed: any): string | null {
  const cf = Array.isArray(embed) ? embed[0] : embed;
  return (cf?.food_name ?? null) as string | null;
}

export async function GET(req: NextRequest) {
  if (!checkPin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

  const { data, error } = await supabase
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];

  const out = rows.map((r) => ({
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
