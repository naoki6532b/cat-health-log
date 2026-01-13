import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function pickId(req: Request, params?: { id?: string }) {
  let id = params?.id;

  if (!id) {
    const path = new URL(req.url).pathname; // /api/meals/26
    id = path.split("/").filter(Boolean).pop();
  }

  if (!id || id === "undefined" || id === "null") return null;
  if (!/^\d+$/.test(id)) return null;

  return id; // bigint想定。文字列のままOK
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = pickId(req, params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("id, dt, food_id, grams, kcal, note")
    .eq("id", id)
    .limit(1); // ← single系を使わない

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = (data ?? [])[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(row);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = pickId(req, params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  if (body.dt != null) patch.dt = body.dt;
  if (body.food_id != null) patch.food_id = body.food_id;
  if (body.grams != null) patch.grams = body.grams;
  if (body.kcal != null) patch.kcal = body.kcal;
  if (body.note != null) patch.note = body.note;

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .update(patch)
    .eq("id", id)
    .select("id, dt, food_id, grams, kcal, note")
    .limit(1); // ← single系を使わない

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = (data ?? [])[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = pickId(req, params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { error } = await supabaseAdmin.from("cat_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
