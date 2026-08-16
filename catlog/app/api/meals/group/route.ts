import { NextResponse } from "next/server";
import { requireCatContext } from "@/lib/serverAuth";

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
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  const url = new URL(req.url);
  const anchor_id = parseId(url.searchParams.get("anchor_id"));
  if (!anchor_id) {
    return NextResponse.json({ error: "anchor_id is required" }, { status: 400 });
  }

  const { data: anchor, error: aErr } = await supabase
    .from("cat_meals")
    .select("id,meal_group_id")
    .eq("id", anchor_id)
    .eq("cat_id", catId)
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
    .eq("cat_id", catId)
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

type PatchItem = {
  meal_id?: number | string | null;
  food_id?: number | string | null;
  grams?: number | string | null;
  kcal?: number | string | null;
};

type PatchBody = {
  anchor_id?: number | string | null;
  dt?: string | null;
  items?: PatchItem[];
};

/**
 * セット（同一 meal_group_id）の給餌量をまとめて修正する。
 * - dt を渡すとグループ全行の日時を揃える
 * - items の各行は food_id / grams（必須）、kcal（任意・未指定なら snapshot から再計算）
 * - anchor と同じグループに属する行のみ更新する
 */
export async function PATCH(req: Request) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const anchorId = parseId(body.anchor_id != null ? String(body.anchor_id) : null);
  if (!anchorId) {
    return NextResponse.json({ error: "anchor_id is required" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];

  const { data: anchor, error: aErr } = await supabase
    .from("cat_meals")
    .select("meal_group_id")
    .eq("id", anchorId)
    .eq("cat_id", catId)
    .single();

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const groupId = anchor?.meal_group_id;
  if (!groupId) {
    return NextResponse.json({ error: "meal_group_id is missing" }, { status: 500 });
  }

  const { data: groupRows, error: gErr } = await supabase
    .from("cat_meals")
    .select("id,kcal_per_g_snapshot")
    .eq("meal_group_id", groupId)
    .eq("cat_id", catId);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const snapMap = new Map<number, number>();
  for (const r of groupRows ?? []) {
    snapMap.set(Number(r.id), Number(r.kcal_per_g_snapshot ?? NaN));
  }

  const requestedFoodIds = Array.from(
    new Set(
      items
        .map((item) =>
          parseId(item.food_id != null ? String(item.food_id) : null)
        )
        .filter((foodId): foodId is number => foodId != null)
    )
  );
  const foodSnapshotMap = new Map<number, number>();

  if (requestedFoodIds.length > 0) {
    const { data: foods, error: foodErr } = await supabase
      .from("cat_foods")
      .select("id,kcal_per_g")
      .in("id", requestedFoodIds);

    if (foodErr) {
      return NextResponse.json({ error: foodErr.message }, { status: 500 });
    }

    for (const food of foods ?? []) {
      foodSnapshotMap.set(Number(food.id), Number(food.kcal_per_g));
    }

    if (foodSnapshotMap.size !== requestedFoodIds.length) {
      return NextResponse.json(
        { error: "選択されたフードが見つかりません" },
        { status: 400 }
      );
    }
  }

  let dtIso: string | null = null;
  if (body.dt != null && body.dt !== "") {
    const parsed = new Date(body.dt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "invalid dt" }, { status: 400 });
    }
    dtIso = parsed.toISOString();
  }

  let updated = 0;

  for (const it of items) {
    const id = parseId(it?.meal_id != null ? String(it.meal_id) : null);
    if (!id || !snapMap.has(id)) continue; // グループ外の行は無視

    const patch: Record<string, unknown> = {};

    const foodId = parseId(
      it.food_id != null ? String(it.food_id) : null
    );
    let snapshot = snapMap.get(id);
    if (it.food_id != null) {
      if (!foodId || !foodSnapshotMap.has(foodId)) {
        return NextResponse.json(
          { error: `invalid food_id for meal_id=${id}` },
          { status: 400 }
        );
      }
      snapshot = foodSnapshotMap.get(foodId);
      patch.food_id = foodId;
      patch.kcal_per_g_snapshot = snapshot;
    }

    const grams =
      it.grams == null || it.grams === "" ? null : Number(it.grams);
    if (grams != null) {
      if (!Number.isFinite(grams) || grams <= 0) {
        return NextResponse.json(
          { error: `invalid grams for meal_id=${id}` },
          { status: 400 }
        );
      }
      patch.grams = grams;
    }

    const kcalIn = it.kcal == null || it.kcal === "" ? null : Number(it.kcal);
    if (kcalIn != null) {
      if (!Number.isFinite(kcalIn)) {
        return NextResponse.json(
          { error: `invalid kcal for meal_id=${id}` },
          { status: 400 }
        );
      }
      patch.kcal = kcalIn;
    } else if (grams != null) {
      if (snapshot != null && Number.isFinite(snapshot)) {
        patch.kcal = Number((grams * snapshot).toFixed(3));
      }
    }

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase
      .from("cat_meals")
      .update(patch)
      .eq("id", id)
      .eq("cat_id", catId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated++;
  }

  // 日時はグループ全行で揃える
  if (dtIso) {
    const { error } = await supabase
      .from("cat_meals")
      .update({ dt: dtIso })
      .eq("meal_group_id", groupId)
      .eq("cat_id", catId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated });
}
