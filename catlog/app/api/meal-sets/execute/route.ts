import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";
import type { Tables, TablesInsert } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type FoodRow = Pick<Tables<"cat_foods">, "id" | "food_name" | "kcal_per_g">;

type MealSetItemRow = Pick<
  Tables<"meal_set_items">,
  "id" | "set_id" | "sort_no" | "food_id" | "grams" | "note"
> & {
  cat_foods: FoodRow | FoodRow[] | null;
};

type MealSetRow = Pick<
  Tables<"meal_sets">,
  "id" | "set_code" | "set_name" | "note" | "is_active"
>;

type ExecuteBody = {
  set_id?: number | string | null;
  set_code?: string | null;
  dt?: string | null;
  note?: string | null;
};

function toIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function pickFood(cat_foods: FoodRow | FoodRow[] | null): FoodRow | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0] ?? null;
  return cat_foods;
}

function buildRowNote(groupNote: string | null, itemNote: string | null): string | null {
  const parts = [groupNote, itemNote]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter((v) => v !== "");
  return parts.length > 0 ? parts.join(" / ") : null;
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const body = (await req.json().catch(() => null)) as ExecuteBody | null;
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const setId = toIntOrNull(body.set_id);
  const setCode = String(body.set_code ?? "").trim();
  const groupNote = body.note == null ? null : String(body.note).trim() || null;

  if (!setId && !setCode) {
    return NextResponse.json(
      { error: "set_id or set_code is required" },
      { status: 400 }
    );
  }

  let dtIso = new Date().toISOString();
  if (body.dt) {
    const parsed = new Date(body.dt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "invalid dt" }, { status: 400 });
    }
    dtIso = parsed.toISOString();
  }

  const supabase = getSupabaseAdmin();

  let setQuery = supabase
    .from("meal_sets")
    .select("id,set_code,set_name,note,is_active")
    .limit(1);

  if (setId) {
    setQuery = setQuery.eq("id", setId);
  } else {
    setQuery = setQuery.eq("set_code", setCode);
  }

  const { data: setData, error: setErr } = await setQuery.maybeSingle<MealSetRow>();

  if (setErr) {
    return NextResponse.json({ error: setErr.message }, { status: 500 });
  }
  if (!setData) {
    return NextResponse.json({ error: "meal set not found" }, { status: 404 });
  }
  if (!setData.is_active) {
    return NextResponse.json({ error: "meal set is inactive" }, { status: 400 });
  }

  const { data: itemData, error: itemsErr } = await supabase
    .from("meal_set_items")
    .select(
      `
        id,
        set_id,
        sort_no,
        food_id,
        grams,
        note,
        cat_foods (
          id,
          food_name,
          kcal_per_g
        )
      `
    )
    .eq("set_id", setData.id);

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const items = ((itemData ?? []) as unknown as MealSetItemRow[]).sort((a, b) => {
    if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no;
    return a.id - b.id;
  });

  if (items.length === 0) {
    return NextResponse.json(
      { error: "meal set has no items" },
      { status: 400 }
    );
  }

  const mealGroupId = crypto.randomUUID();

  const inserts: TablesInsert<"cat_meals">[] = [];
  for (const item of items) {
    const food = pickFood(item.cat_foods);
    if (!food) {
      return NextResponse.json(
        { error: `food relation not found for food_id=${item.food_id}` },
        { status: 400 }
      );
    }

    const grams = Number(item.grams);
    const kcalPerG = Number(food.kcal_per_g);
    if (!Number.isFinite(grams) || grams <= 0) {
      return NextResponse.json(
        { error: `invalid grams in meal_set_items.id=${item.id}` },
        { status: 400 }
      );
    }
    if (!Number.isFinite(kcalPerG) || kcalPerG <= 0) {
      return NextResponse.json(
        { error: `invalid kcal_per_g for food_id=${food.id}` },
        { status: 400 }
      );
    }

    const kcal = Number((grams * kcalPerG).toFixed(3));

    inserts.push({
      dt: dtIso,
      food_id: item.food_id,
      grams,
      kcal,
      kcal_per_g_snapshot: kcalPerG,
      leftover_g: 0,
      meal_group_id: mealGroupId,
      meal_set_id: setData.id,
      meal_set_code_snapshot: setData.set_code,
      meal_set_name_snapshot: setData.set_name,
      meal_source: "set",
      note: buildRowNote(groupNote, item.note),
    });
  }

  const { data: insertedMeals, error: insertErr } = await supabase
    .from("cat_meals")
    .insert(inserts)
    .select("id,dt,meal_group_id,food_id,grams,kcal,meal_set_id,meal_set_code_snapshot,meal_set_name_snapshot,meal_source");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    meal_group_id: mealGroupId,
    set_id: setData.id,
    set_code: setData.set_code,
    set_name: setData.set_name,
    inserted_count: inserts.length,
    meals: insertedMeals ?? [],
  });
}