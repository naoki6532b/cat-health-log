import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type MealItemIn = {
  food_id: number | string;
  grams: number;
  leftover_g?: number;
  note?: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 200);

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("id, dt, food_id, grams, leftover_g, kcal, note, kcal_per_g_snapshot, meal_group_id")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

async function fetchKcalPerGMap(foodIds: number[]) {
  const { data, error } = await supabaseAdmin
    .from("cat_foods")
    .select("id, kcal_per_g")
    .in("id", foodIds);

  if (error) throw new Error(error.message);

  const map = new Map<number, number>();
  for (const r of data ?? []) {
    const id = Number((r as any).id);
    const kpg = Number((r as any).kcal_per_g);
    if (Number.isFinite(id) && Number.isFinite(kpg)) map.set(id, kpg);
  }
  return map;
}

function toNum(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("number is invalid");
  return n;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    // 共通：dt（セッション時刻）
    const dtIso = body.dt ? String(body.dt) : null;
    const dt = dtIso ? dtIso : null;

    // 共通：meal_group_id（無ければサーバー側デフォルト）
    const meal_group_id = body.meal_group_id ? String(body.meal_group_id) : null;

    // ① 一括（15分ひとくくり）: { dt, meal_group_id?, items: [...] }
    if (Array.isArray(body.items)) {
      const items = body.items as MealItemIn[];
      if (items.length === 0) return NextResponse.json({ error: "items is empty" }, { status: 400 });

      const foodIds = Array.from(
        new Set(items.map((it) => Number(it.food_id)).filter((n) => Number.isFinite(n)))
      ) as number[];
      if (foodIds.length === 0) return NextResponse.json({ error: "food_id is required" }, { status: 400 });

      const kcalMap = await fetchKcalPerGMap(foodIds);

      const rows = items.map((it) => {
        const food_id = toNum(it.food_id);
        const grams = toNum(it.grams);
        const leftover_g = it.leftover_g == null ? 0 : toNum(it.leftover_g);

        if (grams <= 0) throw new Error("grams must be > 0");
        if (leftover_g < 0) throw new Error("leftover_g must be >= 0");
        if (leftover_g > grams) throw new Error("leftover_g must be <= grams");

        const kcalPerG = kcalMap.get(food_id);
        if (kcalPerG == null) throw new Error(`food_id ${food_id} not found`);

        const eatenG = grams - leftover_g;
        const kcal = Math.round(eatenG * kcalPerG * 100) / 100;

        const row: any = {
          food_id,
          grams,
          leftover_g,
          kcal,
          kcal_per_g_snapshot: kcalPerG,
          note: it.note ?? null,
        };
        if (dt) row.dt = dt;
        if (meal_group_id) row.meal_group_id = meal_group_id;
        return row;
      });

      const { data, error } = await supabaseAdmin
        .from("cat_meals")
        .insert(rows)
        .select("id")
        .order("id", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const ids = (data ?? []).map((r: any) => r.id);
      return NextResponse.json({ ok: true, ids });
    }

    // ② 単発（従来互換）: { dt, food_id, grams, kcal?, leftover_g?, note? }
    const food_id = body.food_id;
    if (food_id === undefined || food_id === null || String(food_id).trim() === "") {
      return NextResponse.json({ error: "food_id is required" }, { status: 400 });
    }
    const grams = toNum(body.grams);
    const leftover_g = body.leftover_g == null ? 0 : toNum(body.leftover_g);
    if (grams <= 0) return NextResponse.json({ error: "grams must be > 0" }, { status: 400 });
    if (leftover_g < 0 || leftover_g > grams) {
      return NextResponse.json({ error: "leftover_g must be 0..grams" }, { status: 400 });
    }

    const { data: food, error: foodErr } = await supabaseAdmin
      .from("cat_foods")
      .select("kcal_per_g")
      .eq("id", Number(food_id))
      .single();

    if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });

    const kcalPerG = Number((food as any)?.kcal_per_g);
    if (!Number.isFinite(kcalPerG)) return NextResponse.json({ error: "food.kcal_per_g is invalid" }, { status: 500 });

    const eatenG = grams - leftover_g;
    const kcal = Math.round(eatenG * kcalPerG * 100) / 100;

    const row: any = {
      food_id: Number(food_id),
      grams,
      leftover_g,
      kcal,
      kcal_per_g_snapshot: kcalPerG,
      note: body.note ?? null,
    };
    if (dt) row.dt = dt;
    if (meal_group_id) row.meal_group_id = meal_group_id;

    const { data, error } = await supabaseAdmin
      .from("cat_meals")
      .insert(row)
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
