import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export async function POST(req: Request) {
  try {
    checkPin(req);
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => null);
  if (!body) return new Response("Bad JSON", { status: 400 });

  const { dt, kind, score, amount, note } = body;
  if (!dt || !kind) return new Response("dt/kind required", { status: 400 });

  const { error } = await supabaseAdmin.from("cat_elims").insert({
    dt,
    kind,
    score: score ?? null,
    amount: amount ?? null,
    note: note ?? null,
  });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}