import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireCatContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };
const BUCKET = process.env.CATLOG_MEDICAL_BUCKET || "medical-pdfs";

function parseId(raw: unknown): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanText(v: unknown) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function cleanNumber(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function getId(ctx: RouteCtx) {
  const params = await ctx.params;
  return parseId(params.id);
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const { data, error } = await supabase
      .from("cat_medical_records")
      .select("*")
      .eq("id", id)
      .eq("cat_id", catId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

    const title = cleanText(body.title);
    if (!title) return NextResponse.json({ error: "件名は必須です" }, { status: 400 });

    const patch = {
      dt: cleanText(body.dt) ?? new Date().toISOString(),
      category: cleanText(body.category) ?? "通院",
      title,
      hospital_name: cleanText(body.hospital_name),
      doctor_name: cleanText(body.doctor_name),
      chief_complaint: cleanText(body.chief_complaint),
      assessment: cleanText(body.assessment),
      tests: cleanText(body.tests),
      treatment: cleanText(body.treatment),
      medication: cleanText(body.medication),
      next_visit_date: cleanText(body.next_visit_date),
      weight_kg: cleanNumber(body.weight_kg),
      temperature_c: cleanNumber(body.temperature_c),
      cost: cleanNumber(body.cost),
      note: cleanText(body.note),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("cat_medical_records")
      .update(patch)
      .eq("id", id)
      .eq("cat_id", catId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireCatContext();
  if (auth instanceof NextResponse) return auth;
  const { supabase, catId } = auth;

  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    // RLSスコープの取得で所有権を確認してからストレージを消す
    const { data: existing, error: readError } = await supabase
      .from("cat_medical_records")
      .select("pdf_path")
      .eq("id", id)
      .eq("cat_id", catId)
      .single();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    if (existing?.pdf_path) {
      const admin = getSupabaseAdmin() as any;
      const { error: storageError } = await admin.storage
        .from(BUCKET)
        .remove([existing.pdf_path]);
      if (storageError) {
        return NextResponse.json({ error: storageError.message }, { status: 500 });
      }
    }

    const { error } = await supabase
      .from("cat_medical_records")
      .delete()
      .eq("id", id)
      .eq("cat_id", catId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}