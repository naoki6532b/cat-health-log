import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Row = {
  id: number;
  at: string; // timestamptz
  kind: string | null; // "うんち" / "おしっこ"
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? "30")));

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceIso = since.toISOString();

    // 直近days日分の排泄ログを取って、サーバ側で集計（小規模ならこれで十分速い）
    const { data, error } = await supabaseAdmin
      .from("cat_elims")
      .select("id, at, kind")
      .gte("at", sinceIso)
      .order("at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Row[];

    // day(YYYY-MM-DD) × kind の回数
    const map: Record<string, { poop: number; pee: number }> = {};

    for (const r of rows) {
      const day = new Date(r.at).toISOString().slice(0, 10); // UTC基準でOKならこれ
      if (!map[day]) map[day] = { poop: 0, pee: 0 };

      const k = (r.kind ?? "").trim();
      if (k.includes("うん")) map[day].poop += 1;
      else if (k.includes("おし")) map[day].pee += 1;
    }

    // 日付を埋める（0回の日も出したい）
    const out: { day: string; poop: number; pee: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const day = d.toISOString().slice(0, 10);
      const v = map[day] ?? { poop: 0, pee: 0 };
      out.push({ day, poop: v.poop, pee: v.pee });
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
