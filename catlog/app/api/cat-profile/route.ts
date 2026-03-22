import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

const PROFILE_ID = 1;

type CatProfileRow = {
  id: number;
  cat_name: string | null;
  birthday: string | null;
  photo_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function isValidDate(value: string | null) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const emptyProfile: CatProfileRow = {
  id: PROFILE_ID,
  cat_name: null,
  birthday: null,
  photo_path: null,
  created_at: null,
  updated_at: null,
};

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const supabase = getSupabaseAdmin() as any;
    const { data, error } = await supabase
      .from("cat_profile")
      .select("id, cat_name, birthday, photo_path, created_at, updated_at")
      .eq("id", PROFILE_ID)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? emptyProfile) as CatProfileRow });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

    const catName = cleanText(body.cat_name);
    const birthday = cleanText(body.birthday);

    if (!catName) {
      return NextResponse.json({ error: "猫の名前は必須です" }, { status: 400 });
    }

    if (!isValidDate(birthday)) {
      return NextResponse.json({ error: "誕生日は YYYY-MM-DD 形式で入力してください" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin() as any;

    const { data, error } = await supabase
      .from("cat_profile")
      .upsert(
        {
          id: PROFILE_ID,
          cat_name: catName,
          birthday,
          updated_at: now,
        },
        { onConflict: "id" }
      )
      .select("id, cat_name, birthday, photo_path, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}