import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";

export const dynamic = "force-dynamic";

type ByFoodBody = {
  mode: "by_food";
  anchor_id: number;
  items: Array<{ meal_id: number; leftover_g: number }>;
  note?: string | null;
};

type RatioBody = {
  mode: "ratio";
  anchor_id: number;
  ratio_percent: number; // 0..100
  note?: string | null;
};

type Body = ByFoodBody | RatioBody;

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const anchorId = num((body as any).anchor_id);
  if (!anchorId) return NextResponse.json({ error: "anchor_id is required" }, { status: 400 });

  const note =
    (body as any).note == null || (body as any).note === ""
      ? null
      : String((body as any).note);

  // anchor から group_id を取得
  const { data: anchor, error: aErr } = await supabase
    .from("cat_meals")
    .select("meal_group_id")
    .eq("id", anchorId)
    .single();

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const groupId = (anchor as any)?.meal_group_id;
  if (!groupId) return NextResponse.json({ error: "meal_group_id is missing" }, { status: 500 });

  // group の全行を取得（grams 上限チェック用）
  const { data: meals, error: mErr } = await supabase
    .from("cat_meals")
    .select("id,grams,note")
    .eq("meal_group_id", groupId);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const rows = (meals ?? []).map((r: any) => ({
    id: Number(r.id),
    grams: Number(r.grams ?? 0),
    note: r.note ?? null,
  }));

  const gramsMap = new Map<number, number>();
  const noteMap = new Map<number, string | null>();
  for (const r of rows) {
    gramsMap.set(r.id, r.grams);
    noteMap.set(r.id, r.note);
  }

  // note を全行に追記（任意）
  async function appendNoteAll() {
    if (!note) return;
    const suffix = `[LEFTOVER] ${note}`;

    for (const r of rows) {
      const merged = r.note ? `${r.note}\n${suffix}` : suffix;
      const { error } = await supabase.from("cat_meals").update({ note: merged }).eq("id", r.id);
      if (error) throw new Error(error.message);
    }
  }

  try {
    if ((body as any).mode === "ratio") {
      const ratio = num((body as any).ratio_percent);
      if (ratio == null) return NextResponse.json({ error: "ratio_percent is required" }, { status: 400 });

      const pct = clamp(ratio, 0, 100);
      const frac = pct / 100;

      const updates = rows.map((r) => {
        const lv = Number((r.grams * frac).toFixed(3));
        return { id: r.id, leftover_g: clamp(lv, 0, r.grams) };
      });

      for (const u of updates) {
        const { error } = await supabase.from("cat_meals").update({ leftover_g: u.leftover_g }).eq("id", u.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await appendNoteAll();

      return NextResponse.json({ ok: true, updated: updates.length });
    }

    // by_food
    const items = (body as any).items;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }

    let updated = 0;

    for (const it of items) {
      const id = num((it as any).meal_id);
      const lv = num((it as any).leftover_g);
      if (!id || lv == null) continue;

      const grams = gramsMap.get(id);
      if (grams == null) continue;

      const leftover_g = clamp(lv, 0, grams);

      const { error } = await supabase.from("cat_meals").update({ leftover_g }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      updated++;
    }

    await appendNoteAll();

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
