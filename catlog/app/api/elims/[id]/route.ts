import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

type ElimKind = "stool" | "urine" | "both";

function parseId(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeKind(raw: unknown): ElimKind | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (s === "うんち" || s === "stool" || s === "poop") return "stool";
  if (s === "おしっこ" || s === "urine" || s === "pee") return "urine";
  if (s === "両方" || s === "both") return "both";

  return null;
}

function deriveKindFromFields(stool: unknown, urine: unknown): ElimKind | null {
  const hasStool = String(stool ?? "").trim() !== "";
  const hasUrine = String(urine ?? "").trim() !== "";

  if (hasStool && hasUrine) return "both";
  if (hasStool) return "stool";
  if (hasUrine) return "urine";
  return null;
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

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = await getId(req, ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    const patch: Record<string, any> = {};

    if (body.dt !== undefined) patch.dt = body.dt;

    if (body.urine_ml !== undefined) {
      patch.urine_ml =
        body.urine_ml === null || String(body.urine_ml).trim() === ""
          ? null
          : Number(body.urine_ml);
    }

    if (body.amount !== undefined) {
      patch.amount =
        body.amount === null || String(body.amount).trim() === ""
          ? null
          : Number(body.amount);
    }

    if (body.note !== undefined) {
      patch.note = body.note === "" ? null : body.note;
    }

    if (body.vomit !== undefined) patch.vomit = body.vomit === true;

    if (body.score !== undefined) {
      patch.score =
        body.score === null || String(body.score).trim() === ""
          ? null
          : Number(body.score);
    }

    if (body.stool !== undefined) {
      patch.stool = body.stool === null || String(body.stool).trim() === "" ? null : body.stool;
    }

    if (body.urine !== undefined) {
      patch.urine = body.urine === null || String(body.urine).trim() === "" ? null : body.urine;
    }

    if (body.kind !== undefined) {
      const kind = normalizeKind(body.kind);
      if (!kind) {
        return NextResponse.json(
          { error: "kind must be stool / urine / both" },
          { status: 400 }
        );
      }

      patch.kind = kind;
      patch.stool = kind === "stool" || kind === "both" ? "stool" : null;
      patch.urine = kind === "urine" || kind === "both" ? "urine" : null;
    } else if (body.stool !== undefined || body.urine !== undefined) {
      const derivedKind = deriveKindFromFields(patch.stool, patch.urine);
      if (!derivedKind) {
        return NextResponse.json(
          { error: "stool / urine を両方とも空にはできません" },
          { status: 400 }
        );
      }
      patch.kind = derivedKind;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() as any;
    const { error } = await supabase.from("cat_elims").update(patch as any).eq("id", id);

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

    const supabase = getSupabaseAdmin() as any;
    const { error } = await supabase.from("cat_elims").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}