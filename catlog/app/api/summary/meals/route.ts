import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export async function GET(req: Request) {
  try {
    checkPin(req);
  } catch (e) {
    return e as Response;
  }

  // 直近30日だけ（必要なら変える）
  const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("cat_meals")
    .select("dt, grams, kcal, cat_foods(food_name)")
    .gte("dt", from)
    .order("dt", { ascending: true });

  if (error) return new Response(error.message, { status: 500 });

  const rows = (data ?? []).map((r: any) => ({
    dt: r.dt,
    food_name: r.cat_foods?.food_name ?? "",
    grams: Number(r.grams),
    kcal: Number(r.kcal),
  }));

  return Response.json(rows);
}