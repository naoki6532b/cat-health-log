import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";
import type { Tables, TablesInsert } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type FoodRow = Pick<Tables<"cat_foods">, "id" | "food_name" | "kcal_per_g">;

type MealSetItemRow = Pick<
  Tables<"meal_set_items">,
  "id" | "set_id" | "sort_no" | "food_id" | "grams" | "note" | "created_at" | "updated_at"
> & {
  cat_foods: FoodRow | FoodRow[] | null;
};

type MealSetRow = Tables<"meal_sets"> & {
  meal_set_items: MealSetItemRow[] | null;
};

type MealSetCreateBody = {
  set_code?: string | null;
  set_name?: string | null;
  note?: string | null;
  is_active?: boolean | null;
  items?: Array<{
    food_id?: number | string | null;
    grams?: number | string | null;
    note?: string | null;
    sort_no?: number | string | null;
  }>;
};

function toIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function toNumOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickFood(cat_foods: FoodRow | FoodRow[] | null): FoodRow | null {
  if (!cat_foods) return null;
  if (Array.isArray(cat_foods)) return cat_foods[0] ?? null;
  return cat_foods;
}

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const url = new URL(req.url);
  const includeInactive =
    url.searchParams.get("include_inactive") === "1" ||
    url.searchParams.get("include_inactive") === "true";

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("meal_sets")
    .select(
      `
        id,
        set_code,
        set_name,
        note,
        is_active,
        user_id,
        created_at,
        updated_at,
        meal_set_items (
          id,
          set_id,
          sort_no,
          food_id,
          grams,
          note,
          created_at,
          updated_at,
          cat_foods (
            id,
            food_name,
            kcal_per_g
          )
        )
      `
    )
    .order("set_code", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = (data ?? []) as unknown as MealSetRow[];

  const out = raw.map((setRow) => {
    const items = [...(setRow.meal_set_items ?? [])]
      .sort((a, b) => {
        if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no;
        return a.id - b.id;
      })
      .map((item) => {
        const food = pickFood(item.cat_foods);
        return {
          id: item.id,
          set_id: item.set_id,
          sort_no: item.sort_no,
          food_id: item.food_id,
          grams: item.grams,
          note: item.note,
          food_name: food?.food_name ?? null,
          kcal_per_g: food?.kcal_per_g ?? null,
        };
      });

    return {
      id: setRow.id,
      set_code: setRow.set_code,
      set_name: setRow.set_name,
      note: setRow.note,
      is_active: setRow.is_active,
      created_at: setRow.created_at,
      updated_at: setRow.updated_at,
      items,
    };
  });

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const body = (await req.json().catch(() => null)) as MealSetCreateBody | null;
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const setCode = String(body.set_code ?? "").trim();
  const setName = String(body.set_name ?? "").trim();
  const note = body.note == null ? null : String(body.note).trim() || null;
  const isActive = body.is_active == null ? true : Boolean(body.is_active);

  if (!setCode) {
    return NextResponse.json({ error: "set_code is required" }, { status: 400 });
  }
  if (!setName) {
    return NextResponse.json({ error: "set_name is required" }, { status: 400 });
  }

  const srcItems = Array.isArray(body.items) ? body.items : [];
  if (srcItems.length === 0) {
    return NextResponse.json({ error: "items are required" }, { status: 400 });
  }

  const normalizedItems = srcItems.map((item, idx) => {
    const foodId = toIntOrNull(item.food_id);
    const grams = toNumOrNull(item.grams);
    const sortNo = toIntOrNull(item.sort_no) ?? idx + 1;
    const itemNote = item.note == null ? null : String(item.note).trim() || null;

    return {
      food_id: foodId,
      grams,
      sort_no: sortNo,
      note: itemNote,
    };
  });

  for (const item of normalizedItems) {
    if (!item.food_id || item.food_id <= 0) {
      return NextResponse.json({ error: "invalid food_id in items" }, { status: 400 });
    }
    if (item.grams == null || !Number.isFinite(item.grams) || item.grams <= 0) {
      return NextResponse.json({ error: "invalid grams in items" }, { status: 400 });
    }
    if (!item.sort_no || item.sort_no <= 0) {
      return NextResponse.json({ error: "invalid sort_no in items" }, { status: 400 });
    }
  }

  const sortNoSet = new Set<number>();
  for (const item of normalizedItems) {
    if (sortNoSet.has(item.sort_no)) {
      return NextResponse.json(
        { error: "sort_no must be unique within one set" },
        { status: 400 }
      );
    }
    sortNoSet.add(item.sort_no);
  }

  const supabase = getSupabaseAdmin();

  const foodIds = normalizedItems.map((x) => x.food_id as number);
  const { data: foods, error: foodsErr } = await supabase
    .from("cat_foods")
    .select("id")
    .in("id", foodIds);

  if (foodsErr) {
    return NextResponse.json({ error: foodsErr.message }, { status: 500 });
  }

  const existingFoodIds = new Set((foods ?? []).map((f) => f.id));
  for (const foodId of foodIds) {
    if (!existingFoodIds.has(foodId)) {
      return NextResponse.json(
        { error: `food_id not found: ${foodId}` },
        { status: 400 }
      );
    }
  }

  const setInsert: TablesInsert<"meal_sets"> = {
    set_code: setCode,
    set_name: setName,
    note,
    is_active: isActive,
  };

  const { data: insertedSet, error: setErr } = await supabase
    .from("meal_sets")
    .insert(setInsert)
    .select("id,set_code,set_name,note,is_active,created_at,updated_at")
    .single();

  if (setErr) {
    const message =
      setErr.code === "23505"
        ? "set_code already exists"
        : setErr.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const setId = insertedSet.id;

  const itemInserts: TablesInsert<"meal_set_items">[] = normalizedItems.map((item) => ({
    set_id: setId,
    sort_no: item.sort_no,
    food_id: item.food_id as number,
    grams: item.grams as number,
    note: item.note,
  }));

  const { error: itemsErr } = await supabase
    .from("meal_set_items")
    .insert(itemInserts);

  if (itemsErr) {
    await supabase.from("meal_sets").delete().eq("id", setId);
    return NextResponse.json({ error: itemsErr.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    set: insertedSet,
    item_count: itemInserts.length,
  });
}