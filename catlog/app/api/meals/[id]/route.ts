import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function parseId(raw: unknown) {
  const s = String(raw ?? "");
  if (!/^\d+$/.test(s)) return null;
  const id = Number(s);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

function getId(req: Request, params?: { id?: string }) {
  // 1) まず params を試す
  const a = parseId(params?.id);
  if (a) return a;

  // 2) params が取れない場合は URL から拾う（確実）
  const path = new URL(req.url).pathname; // 例: /api/meals/44
  const m = path.match(/\/api\/meals\/(\d+)(?:\/)?$/);
  if (!m) return null;
  return parseId(m[1]);
}

type Ctx = { params?: { id?: string } };

export async function GET(req: Request, ctx: Ctx) {
  const id = getId(req, ctx?.params);
  if (!id) {
    return NextResponse.json(
      { error: "invalid id", debug: { pathname: new URL(req.url).pathname, params: ctx?.params ?? null } },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("id, dt, food_id, grams, kcal, note, kcal_per_g_snapshot, leftover_g")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = getId(req, ctx?.params);
  if (!id) {
    return NextResponse.json(
      { error: "invalid id", debug: { pathname: new URL(req.url).pathname, params: ctx?.params ?? null } },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: any = {};
  if (body.dt != null) patch.dt = body.dt;
  if (body.food_id != null) patch.food_id = Number(body.food_id);
  if (body.grams != null) patch.grams = Number(body.grams);
  if (body.kcal != null) patch.kcal = Number(body.kcal);
  if (body.note !== undefined) patch.note = body.note;
  if (body.leftover_g != null) patch.leftover_g = Number(body.leftover_g);

  // food_id を触るなら snapshot を埋める（NOT NULL対策）
  if (patch.food_id != null) {
    const { data: food, error: foodErr } = await supabaseAdmin
      .from("cat_foods")
      .select("kcal_per_g")
      .eq("id", patch.food_id)
      .maybeSingle();

    if (foodErr) return NextResponse.json({ error: foodErr.message }, { status: 500 });
    if (!food) return NextResponse.json({ error: "food not found" }, { status: 400 });

    patch.kcal_per_g_snapshot = Number(food.kcal_per_g);
  }

  const { error } = await supabaseAdmin.from("cat_meals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const id = getId(req, ctx?.params);
  if (!id) {
    return NextResponse.json(
      { error: "invalid id", debug: { pathname: new URL(req.url).pathname, params: ctx?.params ?? null } },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("cat_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
