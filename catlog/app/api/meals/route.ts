import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export async function POST(req: Request) {
  try { checkPin(req); } catch (e) { return e as Response; }

  const body = await req.json().catch(() => null);
  if (!body) return new Response("Bad JSON", { status: 400 });

  const { dt, food_id, grams, kcal, note } = body;

  if (!dt || !food_id || !grams || !kcal) {
    return new Response("dt/food_id/grams/kcal required", { status: 400 });
  }

  // フードのkcal_per_gを取得（スナップショット保存用）
  const { data: food, error: fe } = await supabaseAdmin
    .from("cat_foods")
    .select("kcal_per_g")
    .eq("id", food_id)
    .single();

  if (fe) return new Response(fe.message, { status: 500 });

  const { error } = await supabaseAdmin.from("cat_meals").insert({
    dt,
    food_id,
    grams,
    kcal,
    kcal_per_g_snapshot: food.kcal_per_g,
    note: note ?? null,
  });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}