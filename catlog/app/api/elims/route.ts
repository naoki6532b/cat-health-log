import { NextResponse } from "next/server";
import { requireCatContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function startOfTodayJST_asUTC(): Date {
  const now = new Date();
  const nowJST = new Date(now.getTime() + JST_OFFSET_MS);

  return new Date(
    Date.UTC(
      nowJST.getUTCFullYear(),
      nowJST.getUTCMonth(),
      nowJST.getUTCDate()
    )
  );
}

function normalizeKind(raw: unknown): "stool" | "urine" | "both" | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (s === "うんち" || s === "stool" || s === "poop") return "stool";
  if (s === "おしっこ" || s === "urine" || s === "pee") return "urine";
  if (s === "両方" || s === "both") return "both";

  return null;
}

export async function GET(req: Request) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const url = new URL(req.url);
    const from = String(url.searchParams.get("from") ?? "").trim();
    const to = String(url.searchParams.get("to") ?? "").trim();
    const days = Math.max(
      1,
      Math.min(90, Number(url.searchParams.get("days") ?? "14") || 14)
    );

    let query = supabase
      .from("cat_elims")
      .select("id, dt, stool, urine, urine_ml, amount, note, vomit, kind, score")
      .eq("cat_id", catId)
      .order("dt", { ascending: false });

    if (from && to) {
      const fromIso = `${from}T00:00:00+09:00`;
      const toIso = `${to}T23:59:59.999+09:00`;
      query = query.gte("dt", new Date(fromIso).toISOString()).lte("dt", new Date(toIso).toISOString());
    } else {
      // daily と同じ基準にそろえる
      const start = startOfTodayJST_asUTC();
      start.setUTCDate(start.getUTCDate() - (days - 1));
      query = query.gte("dt", start.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

    const dt = body.dt ?? body.datetime ?? body.dateTime ?? body.at;
    if (!dt) {
      return NextResponse.json({ error: "dt is required" }, { status: 400 });
    }

    const kind = normalizeKind(body.kind);
    if (!kind) {
      return NextResponse.json(
        { error: "kind is required (stool/urine/both or うんち/おしっこ/両方)" },
        { status: 400 }
      );
    }

    let stool = body.stool ?? null;
    let urine = body.urine ?? null;

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
      body.urine_ml === undefined ||
      body.urine_ml === null ||
      String(body.urine_ml).trim() === ""
        ? null
        : Number(body.urine_ml);

    const amount =
      body.amount === undefined ||
      body.amount === null ||
      String(body.amount).trim() === ""
        ? null
        : Number(body.amount);

    const note = body.note ?? null;
    const vomit = body.vomit === true;

    const score =
      body.score === undefined ||
      body.score === null ||
      String(body.score).trim() === ""
        ? null
        : Number(body.score);

    const { error } = await supabase.from("cat_elims").insert({
      cat_id: catId,
      dt,
      stool,
      urine,
      urine_ml: Number.isFinite(urine_ml as any) ? urine_ml : null,
      amount: Number.isFinite(amount as any) ? amount : null,
      note: note === "" ? null : note,
      vomit,
      kind,
      score: Number.isFinite(score as any) ? score : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
