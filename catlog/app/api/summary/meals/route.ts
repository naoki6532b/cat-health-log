import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "@/app/api/_pin";

export const dynamic = "force-dynamic";

type Row = {
  dt: string;
  grams: number;
  kcal: number;
  leftover_g: number | null;
  kcal_per_g_snapshot: number | null;
  cat_foods: { food_name: string }[] | { food_name: string } | null;
};

function pickFoodName(cf: Row["cat_foods"]): string {
  if (!cf) return "";
  if (Array.isArray(cf)) return cf[0]?.food_name ?? "";
  return cf.food_name ?? "";
}

// JSTの YYYY-MM-DD
function jstYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "YYYY-MM-DD"
}

// YYYY-MM-DD を JST日の開始/終了 ISO(+09:00) にする
function jstRangeIso(fromYmd: string, toYmd: string) {
  const fromIso = `${fromYmd}T00:00:00+09:00`;
  const toIso = `${toYmd}T23:59:59.999+09:00`;
  return { fromIso, toIso };
}

// YYYY-MM-DD を delta 日ずらした YYYY-MM-DD（JST基準）
function addDaysYmd(ymd: string, delta: number) {
  // +09:00 を明示して「JSTのその日」を確定させる
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return jstYmd(d);
}

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from"); // "YYYY-MM-DD"
  const toParam = url.searchParams.get("to");     // "YYYY-MM-DD"
  const daysParamRaw = url.searchParams.get("days");

  // 優先順位：from/to > days > デフォルト(30日)
  let fromIso: string;
  let toIso: string;

  if (fromParam && toParam) {
    ({ fromIso, toIso } = jstRangeIso(fromParam, toParam));
  } else {
    const days = Math.max(
      1,
      Number.isFinite(Number(daysParamRaw)) ? Number(daysParamRaw) : 30
    );

    const toYmd = jstYmd(new Date());
    const fromYmd = addDaysYmd(toYmd, -(days - 1));
    ({ fromIso, toIso } = jstRangeIso(fromYmd, toYmd));
  }

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("dt, grams, kcal, leftover_g, kcal_per_g_snapshot, cat_foods(food_name)")
    .gte("dt", fromIso)
    .lte("dt", toIso)
    .order("dt", { ascending: true })
    .returns<Row[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => {
    const grams = Number(r.grams ?? 0);
    const kcal = Number(r.kcal ?? 0);
    const leftover_g = Number(r.leftover_g ?? 0);
    const snap = Number(r.kcal_per_g_snapshot ?? NaN);

    const net_grams = Math.max(0, grams - leftover_g);
    const net_kcal = Number.isFinite(snap)
      ? Math.max(0, kcal - leftover_g * snap)
      : kcal;

    return {
      dt: r.dt,
      food_name: pickFoodName(r.cat_foods),
      grams,
      kcal,
      leftover_g,
      net_grams,
      net_kcal: Math.round(net_kcal * 10) / 10, // 0.1kcal
    };
  });

  return NextResponse.json(rows);
}
