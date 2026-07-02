import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireCatContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const BUCKET = process.env.CATLOG_PROFILE_BUCKET || "cat-profile-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// 旧 cat_profile 互換のレスポンス形
function toProfile(row: any) {
  return {
    id: row.id,
    cat_name: row.name ?? null,
    birthday: row.birthday ?? null,
    photo_path: row.photo_path ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function POST(req: Request) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "画像ファイルが必要です" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "jpg / png / webp のみアップロードできます" }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "画像は 5MB 以下にしてください" }, { status: 400 });
    }

    // RLSスコープの取得で所有権を確認してからストレージを操作する
    const { data: existing, error: existingError } = await supabase
      .from("cats")
      .select("photo_path")
      .eq("id", catId)
      .single();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const admin = getSupabaseAdmin() as any;

    if (existing?.photo_path) {
      const { error: removeError } = await admin.storage
        .from(BUCKET)
        .remove([existing.photo_path]);
      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const safeExt = String(ext ?? "jpg").replace(/[^A-Za-z0-9]/g, "") || "jpg";
    const path = `profile/${catId}_${Date.now()}.${safeExt}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error: updateError } = await supabase
      .from("cats")
      .update({
        photo_path: path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", catId)
      .select("id, name, birthday, photo_path, created_at, updated_at")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: toProfile(data) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const { data: existing, error } = await supabase
      .from("cats")
      .select("photo_path")
      .eq("id", catId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existing?.photo_path) {
      const admin = getSupabaseAdmin() as any;
      const { error: removeError } = await admin.storage
        .from(BUCKET)
        .remove([existing.photo_path]);
      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
    }

    const { data, error: updateError } = await supabase
      .from("cats")
      .update({
        photo_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", catId)
      .select("id, name, birthday, photo_path, created_at, updated_at")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: toProfile(data) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
