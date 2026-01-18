import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Row = {
  id: number;
  at: string; // timestamptz
  kind: string | null; // "うんち" / "おしっこ"
};

// JST の YYYY-MM-DD を作る（UTCズレ防止）
function ymdJst(iso: string): string {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// JSTの「今日」を基準に days 日分の YYYY-MM-DD を作る
function startDayIsoJst(days: number): { startIsoUtc: string; days: string[] } {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  // JSTの 00:00 を作る
  const startJst = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 0, 0, 0));
  startJst.setUTCDate(startJst.getUTCDate() - (days - 1));

  // そのJST 00:00 を UTC に戻した時刻（DB検索の下限に使う）
  const startIsoUtc = new Date(startJst.getTime() - 9 * 60 * 60 * 1000).toISOString();

  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startJst);
    d.setUTCDate(startJst.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10)); // これは “JSTの日付” を表す文字列
  }

  return { startIsoUtc, days: out };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? "30")));

    const { startIsoUtc, days: dayList } = startDayIsoJst(days);

    const { data, error } = await supabaseAdmin
     .from("cat_elims")
     .select("id, at, kind")
     .returns<Row[]>();


    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Row[];

    const map: Record<string, { poop: number; pee: number }> = {};

    for (const r of rows) {
      const day = ymdJst(r.at); // ★JSTで集計
      if (!map[day]) map[day] = { poop: 0, pee: 0 };

      const k = (r.kind ?? "").trim();
      if (k.includes("うん")) map[day].poop += 1;
      else if (k.includes("おし")) map[day].pee += 1;
    }

    // 日付埋め（0の日も出す）
    const out = dayList.map((day) => {
      const v = map[day] ?? { poop: 0, pee: 0 };
      return { day, poop: v.poop, pee: v.pee };
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
