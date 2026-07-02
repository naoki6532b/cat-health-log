import { NextResponse } from "next/server";
import { requireUser } from "@/lib/serverAuth";
import type { TablesInsert } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function toNumOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  try {
    const { data, error } = await supabase
      .from("cat_foods")
      .select(
        "id, food_name, food_type, kcal_per_g, package_g, package_kcal, created_at, updated_at"
      )
      .order("food_name");

    if (error) {
      return new Response(error.message, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return new Response("Bad JSON", { status: 400 });

    const food_name = String(body.food_name ?? "").trim();
    const food_type =
      body.food_type == null ? null : String(body.food_type).trim() || null;
    const kcal_per_g = toNumOrNull(body.kcal_per_g);
    const package_g = toNumOrNull(body.package_g);
    const package_kcal = toNumOrNull(body.package_kcal);

    if (!food_name || !kcal_per_g || kcal_per_g <= 0) {
      return new Response("food_name/kcal_per_g required", { status: 400 });
    }

    const insertRow: TablesInsert<"cat_foods"> = {
      food_name,
      food_type,
      kcal_per_g,
      package_g,
      package_kcal,
      user_id: user.id,
    };

    const { error } = await supabase.from("cat_foods").insert(insertRow);

    if (error) return new Response(error.message, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}