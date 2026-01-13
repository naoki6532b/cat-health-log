import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "./_pin";

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "14") || 14));

    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    // dt は timestamptz。比較は ISO でOK
    const fromIso = from.toISOString();

    const { data, error } = await supabaseAdmin
      .from("cat_elims")
      .select("id, dt, stool, urine, amount, note, vomit")
      .gte("dt", fromIso)
      .order("dt", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    // DB: public.cat_elims の実カラムに合わせる（dt / stool / urine / note / vomit / amount）
    const dt = body.dt ?? body.datetime ?? body.dateTime ?? body.at;
    if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });

    // フロントが送ってくる想定：stool/urine は文字（例: "うんち" / "おしっこ"）
    const stool = body.stool ?? null;
    const urine = body.urine ?? null;

    // amount は数値っぽければ数値にする
    let amount: number | null = null;
    if (body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== "") {
      const n = Number(body.amount);
      amount = Number.isFinite(n) ? n : null;
    }

    const note = body.note ?? null;
    const vomit = body.vomit === true;

    const { error } = await supabaseAdmin.from("cat_elims").insert({
      dt,
      stool,
      urine,
      amount,
      note,
      vomit,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
