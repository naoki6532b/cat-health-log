import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

type Food = {
  food_name: string | null;
  kcal_per_g: number | null;
};

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));

  const { data, error } = await supabase
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .order("dt", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = (data ?? []).map((r: any) => ({
    id: r.id,
    dt: r.dt,
    food_id: r.food_id,
    food_name: Array.isArray(r.cat_foods) ? r.cat_foods?.[0]?.food_name ?? null : r.cat_foods?.food_name ?? null,
    grams: r.grams,
    kcal: r.kcal,
    note: r.note,
    kcal_per_g_snapshot: r.kcal_per_g_snapshot,
    leftover_g: r.leftover_g,
  }));

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const dt = String(body.dt ?? "").trim();
  const grams = body.grams == null || body.grams === "" ? null : Number(body.grams);
  const kcal = body.kcal == null || body.kcal === "" ? null : Number(body.kcal);
  const note = body.note == null ? null : String(body.note);
  const leftover_g = body.leftover_g == null || body.leftover_g === "" ? null : Number(body.leftover_g);

  const food_id =
    body.food_id === "" || body.food_id == null ? null : Number(body.food_id);

  if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });
  if (grams != null && !Number.isFinite(grams)) return NextResponse.json({ error: "grams invalid" }, { status: 400 });
  if (kcal != null && !Number.isFinite(kcal)) return NextResponse.json({ error: "kcal invalid" }, { status: 400 });
  if (food_id != null && !Number.isFinite(food_id)) return NextResponse.json({ error: "food_id invalid" }, { status: 400 });
  if (leftover_g != null && !Number.isFinite(leftover_g)) return NextResponse.json({ error: "leftover_g invalid" }, { status: 400 });

  // kcal_per_g_snapshot（NOT NULL）を必ず決める
  let kcal_per_g_snapshot: number | null =
    body.kcal_per_g_snapshot == null || body.kcal_per_g_snapshot === ""
      ? null
      : Number(body.kcal_per_g_snapshot);

  let food_name: string | null = null;

  if (kcal_per_g_snapshot == null) {
    if (food_id != null) {
      // cat_foods から kcal_per_g を取って snapshot にする
      const { data: food, error: ferr } = await supabase
        .from("cat_foods")
        .select("food_name,kcal_per_g")
        .eq("id", food_id)
        .single();

      if (ferr) return NextResponse.json({ error: ferr.message }, { status: 500 });

      const f = food as unknown as Food;
      food_name = f.food_name ?? null;

      if (f.kcal_per_g == null || !Number.isFinite(Number(f.kcal_per_g))) {
        return NextResponse.json(
          { error: "cat_foods.kcal_per_g is missing (cannot fill kcal_per_g_snapshot)" },
          { status: 500 }
        );
      }
      kcal_per_g_snapshot = Number(f.kcal_per_g);
    } else if (grams != null && kcal != null && grams > 0) {
      // food_id がない場合は入力値から算出（最低限）
      kcal_per_g_snapshot = kcal / grams;
    } else {
      return NextResponse.json(
        { error: "food_id or (grams & kcal) is required to fill kcal_per_g_snapshot" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("cat_meals")
    .insert({
      dt,
      food_id,
      grams,
      kcal,
      note,
      leftover_g,
      kcal_per_g_snapshot,
    })
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const joinedFoodName =
    Array.isArray((data as any).cat_foods)
      ? (data as any).cat_foods?.[0]?.food_name ?? null
      : (data as any).cat_foods?.food_name ?? null;

  return NextResponse.json({
    id: (data as any).id,
    dt: (data as any).dt,
    food_id: (data as any).food_id,
    food_name: joinedFoodName ?? food_name ?? null,
    grams: (data as any).grams,
    kcal: (data as any).kcal,
    note: (data as any).note,
    kcal_per_g_snapshot: (data as any).kcal_per_g_snapshot,
    leftover_g: (data as any).leftover_g,
  });
}
