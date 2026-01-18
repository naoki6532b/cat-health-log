import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Next.js 16 の App Router: params は Promise
type RouteCtx = { params: Promise<{ id: string }> };

function parseId(raw: unknown) {
  const s = String(raw ?? "");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getIdFromUrl(req: Request): number | null {
  try {
    const u = new URL(req.url);
    const m = u.pathname.match(/\/api\/meals\/(\d+)(?:\/)?$/);
    return m ? parseId(m[1]) : null;
  } catch {
    return null;
  }
}

async function getId(req: Request, ctx?: { id?: string } | null, ctxPromise?: Promise<{ id: string }>) {
  // 1) ctxPromise (Next.js 16 正式)
  if (ctxPromise) {
    const p = await ctxPromise;
    const id = parseId(p?.id);
    if (id) return id;
  }
  // 2) ctx (念のため)
  const id2 = parseId(ctx?.id);
  if (id2) return id2;

  // 3) URL から拾う（これが効くケースがある）
  const id3 = getIdFromUrl(req);
  if (id3) return id3;

  return null;
}

export async function GET(req: NextRequest, context: RouteCtx) {
  const id = await getId(req, null, context?.params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("id,dt,food_id,grams,kcal,note,kcal_per_g_snapshot,leftover_g,cat_foods(food_name)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: (data as any).id,
    dt: (data as any).dt,
    food_id: (data as any).food_id,
    grams: (data as any).grams,
    kcal: (data as any).kcal,
    note: (data as any).note,
    kcal_per_g_snapshot: (data as any).kcal_per_g_snapshot ?? null,
    leftover_g: (data as any).leftover_g ?? null,
    food_name: (data as any)?.cat_foods?.[0]?.food_name ?? null,
  });
}

export async function PATCH(req: NextRequest, context: RouteCtx) {
  const id = await getId(req, null, context?.params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json();

  const patch: any = {};
  if (body.dt != null) patch.dt = String(body.dt);
  if (body.food_id != null && body.food_id !== "") patch.food_id = Number(body.food_id);
  if (body.grams != null && body.grams !== "") patch.grams = Number(body.grams);
  if (body.kcal != null && body.kcal !== "") patch.kcal = Number(body.kcal);
  if (body.note !== undefined) patch.note = body.note == null ? null : String(body.note);
  if (body.kcal_per_g_snapshot !== undefined)
    patch.kcal_per_g_snapshot = body.kcal_per_g_snapshot == null ? null : Number(body.kcal_per_g_snapshot);
  if (body.leftover_g !== undefined) patch.leftover_g = body.leftover_g == null ? null : Number(body.leftover_g);

  const { error } = await supabaseAdmin.from("cat_meals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, context: RouteCtx) {
  const id = await getId(req, null, context?.params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { error } = await supabaseAdmin.from("cat_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
