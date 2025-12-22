import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export async function GET(req: Request) {
  try { checkPin(req); } catch (e) { return e as Response; }

  const { data, error } = await supabaseAdmin
    .from("cat_foods")
    .select("id, food_name, food_type, kcal_per_g")
    .order("food_name");

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: Request) {
  try { checkPin(req); } catch (e) { return e as Response; }

  const body = await req.json().catch(() => null);
  if (!body) return new Response("Bad JSON", { status: 400 });

  const { food_name, food_type, kcal_per_g, package_g, package_kcal } = body;

  if (!food_name || !kcal_per_g) return new Response("food_name/kcal_per_g required", { status: 400 });

  const { error } = await supabaseAdmin.from("cat_foods").insert({
    food_name,
    food_type: food_type ?? null,
    kcal_per_g,
    package_g: package_g ?? null,
    package_kcal: package_kcal ?? null,
  });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}