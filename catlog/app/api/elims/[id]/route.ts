import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin"; // ★ここが正しい（elims配下の _pin）

export const dynamic = "force-dynamic";

// Next.js 16: params は Promise
type RouteCtx = { params: Promise<{ id: string }> };

function parseId(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getIdFromUrl(req: Request): number | null {
  try {
    const u = new URL(req.url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return parseId(last);
  } catch {
    return null;
  }
}

async function getId(req: Request, ctx?: RouteCtx): Promise<number | null> {
  // まず Next.js の params を試す（取れない環境があるので try）
  try {
    const p = await ctx?.params;
    const id = parseId(p?.id);
    if (id) return id;
  } catch {
    // ignore
  }
  // ダメなら URL から拾う
  return getIdFromUrl(req);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  // ★checkPin は boolean 前提：true/false のみ扱う（絶対に boolean を return しない）
  if (!checkPin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const id = await getId(req, ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    const patch: any = {};

    if (body.dt !== undefined) patch.dt = body.dt;
    if (body.stool !== undefined) patch.stool = body.stool;
    if (body.urine !== undefined) patch.urine = body.urine;
    if (body.urine_ml !== undefined) patch.urine_ml = body.urine_ml;
    if (body.amount !== undefined) patch.amount = body.amount;
    if (body.note !== undefined) patch.note = body.note;
    if (body.score !== undefined) patch.score = body.score;

    if (body.vomit !== undefined) patch.vomit = body.vomit === true;
    if (body.kind !== undefined) patch.kind = String(body.kind);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("cat_elims").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  if (!checkPin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const id = await getId(req, ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("cat_elims").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
