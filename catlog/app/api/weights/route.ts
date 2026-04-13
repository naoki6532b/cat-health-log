import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

function parseJstDayStartIso(ymd: string) {
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}

function parseJstDayEndExclusiveIso(ymd: string) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("cat_weights")
      .select("id, dt, weight_kg, memo")
      .order("dt", { ascending: false });

    if (fromParam || toParam) {
      const fromYmd = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
        ? fromParam
        : "2000-01-01";
      const toYmd = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)
        ? toParam
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());

      query = query
        .gte("dt", parseJstDayStartIso(fromYmd))
        .lt("dt", parseJstDayEndExclusiveIso(toYmd));
    } else {
      const days = Math.max(
        1,
        Math.min(3650, Number(url.searchParams.get("days") ?? "365") || 365)
      );

      const from = new Date();
      from.setDate(from.getDate() - (days - 1));

      query = query.gte("dt", from.toISOString());
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

export async function POST(req: NextRequest) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    const dt = body.dt ?? body.datetime ?? body.dateTime ?? body.at;
    if (!dt) return NextResponse.json({ error: "dt is required" }, { status: 400 });

    const w = Number(body.weight_kg ?? body.weightKg ?? body.weight);
    if (!Number.isFinite(w) || w <= 0) {
      return NextResponse.json(
        { error: "weight_kg must be positive number" },
        { status: 400 }
      );
    }

    const memo = body.memo ?? null;

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("cat_weights").insert([
      { dt, weight_kg: w, memo },
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
