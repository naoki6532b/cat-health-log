import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const TS_COL = "dt";
const STOOL_COL = "stool";
const URINE_COL = "urine";

function ymdJST(iso: string) {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

function startOfTodayJST_asUTC(): Date {
  const now = new Date();
  const nowJST = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate()));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "14") || 14));

    const start = startOfTodayJST_asUTC();
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const selectCols = `${TS_COL}, ${STOOL_COL}, ${URINE_COL}`;

    const { data: rows, error } = await supabaseAdmin
      .from("cat_elims")
      .select(selectCols)
      .gte(TS_COL, start.toISOString())
      .order(TS_COL, { ascending: true });

    if (error) throw error;

    const map: Record<string, { poop: number; pee: number }> = {};

    for (const r of rows ?? []) {
      const dt = String((r as any)[TS_COL] ?? "");
      if (!dt) continue;

      const stool = String((r as any)[STOOL_COL] ?? "").trim();
      const urine = String((r as any)[URINE_COL] ?? "").trim();

      const day = ymdJST(dt);
      if (!map[day]) map[day] = { poop: 0, pee: 0 };

      if (stool !== "") map[day].poop += 1;
      if (urine !== "") map[day].pee += 1;
    }

    const out: { day: string; poop: number; pee: number }[] = [];
    const cur = new Date(start);
    for (let i = 0; i < days; i++) {
      const day = ymdJST(cur.toISOString());
      const v = map[day] ?? { poop: 0, pee: 0 };
      out.push({ day, poop: v.poop, pee: v.pee });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
