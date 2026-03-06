import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

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

type PatchBody = {
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

async function loadOne(setId: number) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
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
    .eq("id", setId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const setRow = data as unknown as MealSetRow;

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
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const { id } = await context.params;
    const setId = Number(id);

    if (!setId || Number.isNaN(setId)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    const row = await loadOne(setId);
    if (!row) {
      return NextResponse.json({ error: "meal set not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const { id } = await context.params;
    const setId = Number(id);

    if (!setId || Number.isNaN(setId)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body) {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: exists, error: existsErr } = await supabase
      .from("meal_sets")
      .select("id")
      .eq("id", setId)
      .maybeSingle();

    if (existsErr) {
      return NextResponse.json({ error: existsErr.message }, { status: 500 });
    }
    if (!exists) {
      return NextResponse.json({ error: "meal set not found" }, { status: 404 });
    }

    const patch: TablesUpdate<"meal_sets"> = {};
    let hasMasterPatch = false;

    if (body.set_code !== undefined) {
      const v = String(body.set_code ?? "").trim();
      if (!v) {
        return NextResponse.json({ error: "set_code cannot be empty" }, { status: 400 });
      }
      patch.set_code = v;
      hasMasterPatch = true;
    }

    if (body.set_name !== undefined) {
      const v = String(body.set_name ?? "").trim();
      if (!v) {
        return NextResponse.json({ error: "set_name cannot be empty" }, { status: 400 });
      }
      patch.set_name = v;
      hasMasterPatch = true;
    }

    if (body.note !== undefined) {
      patch.note = body.note == null ? null : String(body.note).trim() || null;
      hasMasterPatch = true;
    }

    if (body.is_active !== undefined) {
      patch.is_active = Boolean(body.is_active);
      hasMasterPatch = true;
    }

    let normalizedItems:
      | Array<{
          food_id: number;
          grams: number;
          sort_no: number;
          note: string | null;
        }>
      | null = null;

    if (body.items !== undefined) {
      const srcItems = Array.isArray(body.items) ? body.items : [];

      if (srcItems.length === 0) {
        return NextResponse.json({ error: "items cannot be empty" }, { status: 400 });
      }

      normalizedItems = srcItems.map((item, idx) => {
        const foodId = toIntOrNull(item.food_id);
        const grams = toNumOrNull(item.grams);
        const sortNo = toIntOrNull(item.sort_no) ?? idx + 1;
        const note = item.note == null ? null : String(item.note).trim() || null;

        return {
          food_id: foodId ?? 0,
          grams: grams ?? 0,
          sort_no: sortNo,
          note,
        };
      });

      for (const item of normalizedItems) {
        if (!item.food_id || item.food_id <= 0) {
          return NextResponse.json(
            { error: "invalid food_id in items" },
            { status: 400 }
          );
        }
        if (!Number.isFinite(item.grams) || item.grams <= 0) {
          return NextResponse.json(
            { error: "invalid grams in items" },
            { status: 400 }
          );
        }
        if (!item.sort_no || item.sort_no <= 0) {
          return NextResponse.json(
            { error: "invalid sort_no in items" },
            { status: 400 }
          );
        }
      }

      const sortNos = new Set<number>();
      for (const item of normalizedItems) {
        if (sortNos.has(item.sort_no)) {
          return NextResponse.json(
            { error: "sort_no must be unique within one set" },
            { status: 400 }
          );
        }
        sortNos.add(item.sort_no);
      }

      const foodIds = normalizedItems.map((x) => x.food_id);
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
    }

    if (!hasMasterPatch && normalizedItems === null) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    if (hasMasterPatch) {
      const { error: updateErr } = await supabase
        .from("meal_sets")
        .update(patch)
        .eq("id", setId);

      if (updateErr) {
        const message =
          updateErr.code === "23505"
            ? "set_code already exists"
            : updateErr.message;
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (normalizedItems !== null) {
      const { error: delErr } = await supabase
        .from("meal_set_items")
        .delete()
        .eq("set_id", setId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      const inserts: TablesInsert<"meal_set_items">[] = normalizedItems.map((item) => ({
        set_id: setId,
        sort_no: item.sort_no,
        food_id: item.food_id,
        grams: item.grams,
        note: item.note,
      }));

      const { error: insertErr } = await supabase
        .from("meal_set_items")
        .insert(inserts);

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    const row = await loadOne(setId);
    return NextResponse.json({ ok: true, set: row });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const { id } = await context.params;
    const setId = Number(id);

    if (!setId || Number.isNaN(setId)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: exists, error: existsErr } = await supabase
      .from("meal_sets")
      .select("id")
      .eq("id", setId)
      .maybeSingle();

    if (existsErr) {
      return NextResponse.json({ error: existsErr.message }, { status: 500 });
    }
    if (!exists) {
      return NextResponse.json({ error: "meal set not found" }, { status: 404 });
    }

    const { error: delErr } = await supabase
      .from("meal_sets")
      .delete()
      .eq("id", setId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}