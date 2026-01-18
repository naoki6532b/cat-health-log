import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Next.js 16 の App Router: params は Promise
type RouteCtx = { params: Promise<{ id: string }> };

function parseId(raw: unknown) {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getId(req: Request, params?: { id?: string } | null) {
  // 基本は params.id。念のため pathname 末尾も fallback
  const idStr = params?.id ?? new URL(req.url).pathname.split("/").pop();
  return parseId(idStr);
}

export async function GET(req: NextRequest, { params }: RouteCtx) {
  const p = await params;
  const id = getId(req, p);

  if (!id) {
    return NextResponse.json(
      { error: "invalid id", debug: { pathname: new URL(req.url).pathname, params: p ?? null } },
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

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const p = await params;
  const id = getId(req, p);

  if (!id) {
    return NextResponse.json(
      { error: "invalid id", debug: { pathname: new URL(req.url).pathname, params: p ?? null } },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // ここは既存の仕様に合わせて「来たものだけ更新」
  // ※ dt/food_id/grams/kcal/note/kcal_per_g_snapshot/leftover_g を想定
  const patch: Record<string, any> = {};
  for (const k of ["dt", "food_id", "grams", "kcal", "note", "kcal_per_g_snapshot", "leftover_g"]) {
    if (k in (body as any)) patch[k] = (body as any)[k];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .update(patch)
    .eq("id", id)
    .select("id, dt, food_id, grams, kcal, note, kcal_per_g_snapshot, leftover_g")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const p = await params;
  const id = getId(req, p);

  if (!id) {
    return NextResponse.json(
      { error: "invalid id", debug: { pathname: new URL(req.url).pathname, params: p ?? null } },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("cat_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
