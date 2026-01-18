import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
  kcal_per_g_snapshot?: number | null;
  leftover_g?: number | null;

  // ★ Supabase の join は配列で返ることがある（1件でも配列）
  // さらに列名が name / food_name のどちらで返るか環境で揺れるので両対応
  cat_foods?: Array<{ name?: string | null; food_name?: string | null }> | null;
};

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

  const { data, error } = await supabase
    .from("cat_meals")
    // ★ ここは name でも food_name でもOK。どちらでも拾えるようにしてある
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(name,food_name)")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (Array.isArray(data) ? data : []) as unknown as Row[];

  const out = rows.map((r) => {
    const joined = Array.isArray(r.cat_foods) ? r.cat_foods[0] : null;
    const food_name = joined?.food_name ?? joined?.name ?? null;

    return {
      id: r.id,
      dt: r.dt,
      food_id: r.food_id,
      food_name,
      grams: r.grams,
      kcal: r.kcal,
      note: r.note,
      kcal_per_g_snapshot: r.kcal_per_g_snapshot ?? null,
      leftover_g: r.leftover_g ?? 0,
    };
  });

  return NextResponse.json(out);
}
