// catlog/app/api/meals/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

type MealIn = {
  dt?: string;
  food_id?: number | string | null;
  grams?: number | string | null;
  kcal?: number | string | null;
  note?: string | null;
  leftover_g?: number | string | null;
};

function toNumberOrNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  if (n == null) return null;
  const i = Math.trunc(n);
  return Number.isFinite(i) ? i : null;
}

function round(n: number, digits = 2) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export async function GET(req: Request) {
  if (!checkPin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));

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
    food_id: r.food_id,
    food_name: Array.isArray(r.cat_foods) ? (r.cat_foods?.[0]?.food_name ?? null) : (r.cat_foods?.food_name ?? null),
    grams: r.grams,
    kcal: r.kcal,
    note: r.note,
    kcal_per_g_snapshot: r.kcal_per_g_snapshot,
    leftover_g: r.leftover_g,
  }));

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  if (!checkPin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const body = (await req.json()) as MealIn;

  const dt = String(body.dt ?? "");
  if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });

  const food_id = toIntOrNull(body.food_id);
  let grams = toNumberOrNull(body.grams);
  let kcal = toNumberOrNull(body.kcal);
  const note = body.note == null ? null : String(body.note);
  const leftover_g = toNumberOrNull(body.leftover_g) ?? 0;

  // 1) まず kcal_per_g_snapshot を決める
  let kcal_per_g_snapshot: number | null = null;

  if (food_id != null) {
    // フードマスタから取得（カラム名は kcal_per_g 前提）
    const { data: f, error: fe } = await supabase
      .from("cat_foods")
      .select("kcal_per_g,food_name")
      .eq("id", food_id)
      .single();

    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });

    const kpg = toNumberOrNull(f?.kcal_per_g);
    if (kpg == null) {
      return NextResponse.json({ error: "food kcal_per_g is missing" }, { status: 400 });
    }
    kcal_per_g_snapshot = kpg;
  } else {
    // food_id が無い場合は kcal/grams で作る（両方必要）
    if (grams != null && grams > 0 && kcal != null) {
      kcal_per_g_snapshot = kcal / grams;
    }
  }

  if (kcal_per_g_snapshot == null) {
    return NextResponse.json(
      { error: "kcal_per_g_snapshot cannot be null. Select food or provide both grams & kcal." },
      { status: 400 }
    );
  }

  // 2) grams/kcal を補完（片方だけ入ってるケースを許容）
  if (grams != null && (kcal == null || !Number.isFinite(kcal))) {
    kcal = grams * kcal_per_g_snapshot;
  } else if (kcal != null && (grams == null || !Number.isFinite(grams)) && kcal_per_g_snapshot > 0) {
    grams = kcal / kcal_per_g_snapshot;
  }

  // 3) 体裁（UI表示に合わせて丸め）
  if (grams != null) grams = round(grams, 2);
  if (kcal != null) kcal = round(kcal, 2);
  kcal_per_g_snapshot = round(kcal_per_g_snapshot, 6);

  const insertRow = {
    dt,
    food_id,
    grams,
    kcal,
    note,
    kcal_per_g_snapshot,
    leftover_g,
  };

  const { data, error } = await supabase
    .from("cat_meals")
    .insert(insertRow)
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const food_name = Array.isArray((data as any).cat_foods)
    ? ((data as any).cat_foods?.[0]?.food_name ?? null)
    : ((data as any).cat_foods?.food_name ?? null);

  return NextResponse.json({
    id: (data as any).id,
    dt: (data as any).dt,
    food_id: (data as any).food_id,
    food_name,
    grams: (data as any).grams,
    kcal: (data as any).kcal,
    note: (data as any).note,
    kcal_per_g_snapshot: (data as any).kcal_per_g_snapshot,
    leftover_g: (data as any).leftover_g,
  });
}
