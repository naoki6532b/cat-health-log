import { NextResponse } from "next/server";
import { requireUser, CAT_COOKIE } from "@/lib/serverAuth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function isValidDate(value: string | null) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("cats")
    .select("id, name, birthday, photo_path, created_at, updated_at")
    .order("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(CAT_COOKIE)?.value ?? "";
  const selectedId = /^\d+$/.test(raw) ? Number(raw) : null;

  return NextResponse.json({ data: data ?? [], selected_id: selectedId });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const name = cleanText(body.name);
  const birthday = cleanText(body.birthday);

  if (!name) {
    return NextResponse.json({ error: "猫の名前は必須です" }, { status: 400 });
  }
  if (!isValidDate(birthday)) {
    return NextResponse.json(
      { error: "誕生日は YYYY-MM-DD 形式で入力してください" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("cats")
    .insert({ user_id: user.id, name, birthday })
    .select("id, name, birthday, photo_path, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data }, { status: 201 });
}
