import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const url = new URL(req.url);
    const days = Math.max(
      1,
      Math.min(90, Number(url.searchParams.get("days") ?? "14") || 14)
    );

    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    const fromIso = from.toISOString();

    const { data, error } = await supabaseAdmin
      .from("cat_elims")
      .select("id, dt, stool, urine, urine_ml, amount, note, vomit, kind, score")
      .gte("dt", fromIso)
      .order("dt", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

function normalizeKind(raw: unknown): "stool" | "urine" | "both" | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // UI 側の文言ゆれ吸収
  if (s === "うんち" || s === "stool" || s === "poop") return "stool";
  if (s === "おしっこ" || s === "urine" || s === "pee") return "urine";
  if (s === "両方" || s === "both") return "both";

  // すでに正規化済みの値なら許可
  if (s === "stool" || s === "urine" || s === "both") return s;

  return null;
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    const dt = body.dt ?? body.datetime ?? body.dateTime ?? body.at;
    if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });

    // ★ kind を必須化（ここが今回の原因）
    const kind = normalizeKind(body.kind);
    if (!kind) {
      return NextResponse.json(
        { error: "kind is required (stool/urine/both or うんち/おしっこ/両方)" },
        { status: 400 }
      );
    }

    // UI から stool/urine が来る場合もあれば kind だけの場合もあるので両対応
    let stool = body.stool ?? null;
    let urine = body.urine ?? null;

    // kind が来たら stool/urine も整合させる（両方のときは両方◯）
    if (kind === "stool") {
      stool = stool ?? "stool";
      urine = null;
    } else if (kind === "urine") {
      urine = urine ?? "urine";
      stool = null;
    } else if (kind === "both") {
      stool = stool ?? "stool";
      urine = urine ?? "urine";
    }

    const urine_ml =
      body.urine_ml === undefined || body.urine_ml === null || String(body.urine_ml).trim() === ""
        ? null
        : Number(body.urine_ml);

    const amount =
      body.amount === undefined || body.amount === null || String(body.amount).trim() === ""
        ? null
        : Number(body.amount);

    const note = body.note ?? null;
    const vomit = body.vomit === true;

    const score =
      body.score === undefined || body.score === null || String(body.score).trim() === ""
        ? null
        : Number(body.score);

    const { error } = await supabaseAdmin.from("cat_elims").insert({
      dt,
      stool,
      urine,
      urine_ml: Number.isFinite(urine_ml as any) ? urine_ml : null,
      amount: Number.isFinite(amount as any) ? amount : null,
      note: note === "" ? null : note,
      vomit,
      kind, // ★NOT NULL を必ず満たす
      score: Number.isFinite(score as any) ? score : null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
