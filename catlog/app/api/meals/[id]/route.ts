import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ※ 既存の supabaseAdmin.ts を使ってるならそっちを import してもOK
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!; // 使ってないなら下の createClient 行も差し替え
const supabase = createClient(supabaseUrl, serviceRole);

// Next.js 16 では context.params が Promise になる型が来ることがあるため吸収する
type Ctx = { params: { id: string } | Promise<{ id: string }> };

async function getId(ctx: Ctx) {
  const p = await ctx.params;
  const idNum = Number(p.id);
  if (!Number.isFinite(idNum)) throw new Error("invalid id");
  return idNum;
}

// GET /api/meals/[id]
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);

    const { data, error } = await supabase
      .from("cat_meals")
      .select("id, dt, food_id, grams, kcal, note")
      .eq("id", id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}

// PATCH /api/meals/[id]（編集用）
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    const body = await req.json();

    // 許可する更新項目だけを通す
    const patch: any = {};
    if (body.dt != null) patch.dt = body.dt;
    if (body.food_id != null) patch.food_id = body.food_id;
    if (body.grams != null) patch.grams = body.grams;
    if (body.kcal != null) patch.kcal = body.kcal;
    if (body.note != null) patch.note = body.note;

    const { data, error } = await supabase
      .from("cat_meals")
      .update(patch)
      .eq("id", id)
      .select("id, dt, food_id, grams, kcal, note")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}

// DELETE /api/meals/[id]
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);

    const { error } = await supabase.from("cat_meals").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
