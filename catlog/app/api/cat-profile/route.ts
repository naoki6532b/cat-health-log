import { NextResponse } from "next/server";
import { requireCatContext } from "@/lib/serverAuth";
import {
  DEFAULT_DAILY_KCAL_WARNING_THRESHOLD,
  normalizeCalorieWarningThreshold,
} from "@/lib/calorieWarning";

export const dynamic = "force-dynamic";

// 旧 cat_profile 互換のレスポンス形(フロントの改修を最小にする)
type CatProfileRow = {
  id: number;
  cat_name: string | null;
  birthday: string | null;
  photo_path: string | null;
  daily_kcal_warning_threshold: number;
  created_at: string | null;
  updated_at: string | null;
};

function toProfile(row: any): CatProfileRow {
  return {
    id: row.id,
    cat_name: row.name ?? null,
    birthday: row.birthday ?? null,
    photo_path: row.photo_path ?? null,
    daily_kcal_warning_threshold: normalizeCalorieWarningThreshold(
      row.daily_kcal_warning_threshold
    ),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function isValidDate(value: string | null) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET() {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const { data, error } = await supabase
      .from("cats")
      .select(
        "id, name, birthday, photo_path, daily_kcal_warning_threshold, created_at, updated_at"
      )
      .eq("id", catId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: toProfile(data) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

    const catName = cleanText(body.cat_name);
    const birthday = cleanText(body.birthday);
    const warningThreshold = Number(
      body.daily_kcal_warning_threshold ?? DEFAULT_DAILY_KCAL_WARNING_THRESHOLD
    );

    if (!catName) {
      return NextResponse.json({ error: "猫の名前は必須です" }, { status: 400 });
    }

    if (!isValidDate(birthday)) {
      return NextResponse.json({ error: "誕生日は YYYY-MM-DD 形式で入力してください" }, { status: 400 });
    }

    if (!Number.isFinite(warningThreshold) || warningThreshold <= 0) {
      return NextResponse.json(
        { error: "警告基準カロリーは0より大きい数値で入力してください" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cats")
      .update({
        name: catName,
        birthday,
        daily_kcal_warning_threshold: warningThreshold,
        updated_at: new Date().toISOString(),
      })
      .eq("id", catId)
      .select(
        "id, name, birthday, photo_path, daily_kcal_warning_threshold, created_at, updated_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: toProfile(data) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
