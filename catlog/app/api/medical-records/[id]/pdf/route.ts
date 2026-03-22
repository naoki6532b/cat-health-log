import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../../../_pin";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };
const BUCKET = process.env.CATLOG_MEDICAL_BUCKET || "medical-pdfs";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function parseId(raw: unknown): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getId(ctx: RouteCtx) {
  const params = await ctx.params;
  return parseId(params.id);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const url = new URL(req.url);
    const wantDownload = url.searchParams.get("download") === "1";

    const supabase = getSupabaseAdmin() as any;
    const { data: record, error } = await supabase
      .from("cat_medical_records")
      .select("pdf_path, pdf_name, pdf_size")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!record?.pdf_path) {
      return NextResponse.json({ error: "PDFが添付されていません" }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(
        record.pdf_path,
        60 * 5,
        wantDownload ? { download: record.pdf_name || undefined } : undefined
      );

    if (signError) {
      return NextResponse.json({ error: signError.message }, { status: 500 });
    }

    return NextResponse.json({
      url: signed?.signedUrl ?? null,
      pdf_name: record.pdf_name,
      pdf_size: record.pdf_size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDFファイルが必要です" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "PDFのみ添付できます" }, { status: 400 });
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDFは10MB以下にしてください" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() as any;
    const { data: existing, error: readError } = await supabase
      .from("cat_medical_records")
      .select("pdf_path")
      .eq("id", id)
      .single();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    if (existing?.pdf_path) {
      const { error: oldDeleteError } = await supabase.storage
        .from(BUCKET)
        .remove([existing.pdf_path]);
      if (oldDeleteError) {
        return NextResponse.json({ error: oldDeleteError.message }, { status: 500 });
      }
    }

    const fileName = sanitizeFileName(file.name || `medical_${id}.pdf`);
    const path = `${id}/${Date.now()}_${fileName}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase
      .from("cat_medical_records")
      .update({
        pdf_path: path,
        pdf_name: file.name,
        pdf_size: file.size,
        pdf_uploaded_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const supabase = getSupabaseAdmin() as any;
    const { data: record, error } = await supabase
      .from("cat_medical_records")
      .select("pdf_path")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!record?.pdf_path) {
      return NextResponse.json({ ok: true });
    }

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([record.pdf_path]);

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("cat_medical_records")
      .update({
        pdf_path: null,
        pdf_name: null,
        pdf_size: null,
        pdf_uploaded_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}