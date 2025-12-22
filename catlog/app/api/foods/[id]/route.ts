import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../_pin";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    checkPin(req);
  } catch (e) {
    return e as Response;
  }

  const { id } = await context.params;
  const n = Number(id);
  if (!n) return new Response("Bad id", { status: 400 });

  const { error } = await supabaseAdmin.from("cat_foods").delete().eq("id", n);
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ ok: true });
}