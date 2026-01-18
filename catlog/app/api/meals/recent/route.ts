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
  cat_foods?: { name: string | null } | null;
};

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "20"))
  );

  const { data, error } = await supabase
    .from("cat_meals")
    // FKがあるならこの形で join できる（cat_foods は参照先テーブル名）
    .select("id,dt,food_id,grams,kcal,note,cat_foods(name)")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];

  // UIが期待する形に整形
  const out = rows.map((r) => ({
    id: r.id,
    dt: r.dt,
    food_id: r.food_id,
    food_name: r.cat_foods?.name ?? null,
    grams: r.grams,
    kcal: r.kcal,
    note: r.note,
  }));

  return NextResponse.json(out);
}
