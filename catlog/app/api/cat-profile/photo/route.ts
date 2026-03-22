import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export const dynamic = "force-dynamic";

const PROFILE_ID = 1;
const BUCKET = process.env.CATLOG_PROFILE_BUCKET || "cat-profile-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sanitizeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

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

    const supabase = getSupabaseAdmin() as any;
    const { data: existing, error: existingError } = await supabase
      .from("cat_profile")
      .select("photo_path")
      .eq("id", PROFILE_ID)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing?.photo_path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([existing.photo_path]);
      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const fileName = sanitizeFileName(`profile_${Date.now()}.${ext}`);
    const path = `profile/${fileName}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase
      .from("cat_profile")
      .upsert(
        {
          id: PROFILE_ID,
          photo_path: path,
          updated_at: now,
        },
        { onConflict: "id" }
      )
      .select("id, cat_name, birthday, photo_path, created_at, updated_at")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const supabase = getSupabaseAdmin() as any;
    const { data: existing, error } = await supabase
      .from("cat_profile")
      .select("photo_path")
      .eq("id", PROFILE_ID)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existing?.photo_path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([existing.photo_path]);
      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
    }

    const { data, error: updateError } = await supabase
      .from("cat_profile")
      .upsert(
        {
          id: PROFILE_ID,
          photo_path: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, cat_name, birthday, photo_path, created_at, updated_at")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}