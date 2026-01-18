import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

function getIdFromUrl(req: Request): number | null {
  try {
    const u = new URL(req.url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    const id = Number(last);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = getIdFromUrl(req);
    if (id === null) return NextResponse.json({ error: "Bad id" }, { status: 400 });

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

    const { error } = await supabaseAdmin.from("cat_elims").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = getIdFromUrl(req);
    if (id === null) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const { error } = await supabaseAdmin.from("cat_elims").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
