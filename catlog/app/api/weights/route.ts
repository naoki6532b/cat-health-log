import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const url = new URL(req.url);
    const days = Math.max(
      1,
      Math.min(3650, Number(url.searchParams.get("days") ?? "365") || 365)
    );

    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    const fromIso = from.toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cat_weights")
      .select("id, dt, weight_kg, memo")
      .gte("dt", fromIso)
      .order("dt", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
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

    // ✅ insert は配列で渡す
    const { error } = await supabase.from("cat_weights").insert([
      { dt, weight_kg: w, memo },
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
