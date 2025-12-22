import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  try { checkPin(req); } catch (e) { return e as Response; }

  const id = Number(ctx.params.id);
  if (!id) return new Response("Bad id", { status: 400 });

  const { error } = await supabaseAdmin.from("cat_foods").delete().eq("id", id);
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ ok: true });
}
