import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPin } from "../_pin";

export const dynamic = "force-dynamic";

function likeEscape(s: string) {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
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

function normalizePayload(body: any) {
  const title = cleanText(body.title);
  if (!title) {
    throw new Error("件名は必須です");
  }

  const category = cleanText(body.category) ?? "通院";
  const dt = cleanText(body.dt) ?? new Date().toISOString();
  const nextVisitDate = cleanText(body.next_visit_date);

  return {
    dt,
    category,
    title,
    hospital_name: cleanText(body.hospital_name),
    doctor_name: cleanText(body.doctor_name),
    chief_complaint: cleanText(body.chief_complaint),
    assessment: cleanText(body.assessment),
    tests: cleanText(body.tests),
    treatment: cleanText(body.treatment),
    medication: cleanText(body.medication),
    next_visit_date: nextVisitDate,
    weight_kg: cleanNumber(body.weight_kg),
    temperature_c: cleanNumber(body.temperature_c),
    cost: cleanNumber(body.cost),
    note: cleanText(body.note),
  };
}

export async function GET(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const url = new URL(req.url);
    const category = String(url.searchParams.get("category") ?? "").trim();
    const q = String(url.searchParams.get("q") ?? "").trim();

    const supabase = getSupabaseAdmin() as any;
    let query = supabase
      .from("cat_medical_records")
      .select("*")
      .order("dt", { ascending: false })
      .order("id", { ascending: false });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (q) {
      const escaped = likeEscape(q);
      query = query.or(
        [
          `title.ilike.%${escaped}%`,
          `hospital_name.ilike.%${escaped}%`,
          `doctor_name.ilike.%${escaped}%`,
          `chief_complaint.ilike.%${escaped}%`,
          `assessment.ilike.%${escaped}%`,
          `tests.ilike.%${escaped}%`,
          `treatment.ilike.%${escaped}%`,
          `medication.ilike.%${escaped}%`,
          `note.ilike.%${escaped}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const pinRes = checkPin(req);
  if (pinRes) return pinRes;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

    const payload = normalizePayload(body);
    const now = new Date().toISOString();

    const supabase = getSupabaseAdmin() as any;
    const { data, error } = await supabase
      .from("cat_medical_records")
      .insert({
        ...payload,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}