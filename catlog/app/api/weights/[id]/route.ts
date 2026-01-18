import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

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
  try {
    const p = await ctx?.params;
    const id = parseId(p?.id);
    if (id) return id;
  } catch {
    // ignore
  }
  return getIdFromUrl(req);
}

type WeightUpdate = {
  dt?: string;          // ← null を消す
  weight_kg?: number;
  memo?: string | null; // memo は null OK
};

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = await getId(req, ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as any;
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    const patch: WeightUpdate = {};

  
    if (body.weight_kg !== undefined) {
      const w = Number(body.weight_kg);
      if (!Number.isFinite(w) || w <= 0) {
        return NextResponse.json({ error: "weight_kg must be positive number" }, { status: 400 });
      }
      patch.weight_kg = w;
    }

    if (body.memo !== undefined) {
      const v = String(body.memo ?? "").trim();
      patch.memo = v === "" ? null : v;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("cat_weights").update(patch).eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = await getId(req, ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("cat_weights").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
