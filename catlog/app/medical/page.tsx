"use client";

import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type MedicalRecord = {
  id: number;
  dt: string;
  category: string;
  title: string;
  hospital_name: string | null;
  doctor_name: string | null;
  chief_complaint: string | null;
  assessment: string | null;
  tests: string | null;
  treatment: string | null;
  medication: string | null;
  next_visit_date: string | null;
  weight_kg: number | null;
  temperature_c: number | null;
  cost: number | null;
  note: string | null;
  pdf_path: string | null;
  pdf_name: string | null;
  pdf_size: number | null;
  pdf_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  dtLocal: string;
  category: string;
  title: string;
  hospital_name: string;
  doctor_name: string;
  chief_complaint: string;
  assessment: string;
  tests: string;
  treatment: string;
  medication: string;
  next_visit_date: string;
  weight_kg: string;
  temperature_c: string;
  cost: string;
  note: string;
};

type Mode = "create" | "edit";

const CATEGORY_OPTIONS = ["通院", "検査", "投薬", "ワクチン", "手術", "症状メモ", "その他"];

const RECORDING_TIPS = [
  {
    title: "必ず残したい項目",
    lines: ["件名", "主訴", "所見 / 診断", "処方 / 指示", "次回予定"],
  },
  {
    title: "あると役立つ項目",
    lines: ["病院名", "担当医", "体重", "体温", "費用", "自由メモ"],
  },
  {
    title: "おすすめの書き方",
    lines: [
      "1件 = 1回の受診や症状イベント",
      "左一覧には日付・区分・件名だけ出す",
      "右詳細には経過が追えるように主訴→所見→処方の順で残す",
      "明細PDFは記録1件に対して1つ添付",
    ],
  },
];

function cls(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDateOnly(dateStr: string | null) {
  if (!dateStr) return "—";
  return dateStr;
}

function toDateOnly(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function toDatetimeLocalValue(iso: string | null) {
  const base = iso ? new Date(iso) : new Date();
  const jst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}

function buildEmptyForm(): FormState {
  return {
    dtLocal: toDatetimeLocalValue(null),
    category: "通院",
    title: "",
    hospital_name: "",
    doctor_name: "",
    chief_complaint: "",
    assessment: "",
    tests: "",
    treatment: "",
    medication: "",
    next_visit_date: "",
    weight_kg: "",
    temperature_c: "",
    cost: "",
    note: "",
  };
}

function buildFormFromRecord(record: MedicalRecord): FormState {
  return {
    dtLocal: toDatetimeLocalValue(record.dt),
    category: record.category ?? "通院",
    title: record.title ?? "",
    hospital_name: record.hospital_name ?? "",
    doctor_name: record.doctor_name ?? "",
    chief_complaint: record.chief_complaint ?? "",
    assessment: record.assessment ?? "",
    tests: record.tests ?? "",
    treatment: record.treatment ?? "",
    medication: record.medication ?? "",
    next_visit_date: toDateOnly(record.next_visit_date),
    weight_kg: record.weight_kg == null ? "" : String(record.weight_kg),
    temperature_c: record.temperature_c == null ? "" : String(record.temperature_c),
    cost: record.cost == null ? "" : String(record.cost),
    note: record.note ?? "",
  };
}

function buildPayload(form: FormState) {
  return {
    dt: new Date(form.dtLocal).toISOString(),
    category: form.category,
    title: form.title.trim(),
    hospital_name: form.hospital_name.trim() || null,
    doctor_name: form.doctor_name.trim() || null,
    chief_complaint: form.chief_complaint.trim() || null,
    assessment: form.assessment.trim() || null,
    tests: form.tests.trim() || null,
    treatment: form.treatment.trim() || null,
    medication: form.medication.trim() || null,
    next_visit_date: form.next_visit_date || null,
    weight_kg: form.weight_kg.trim() === "" ? null : Number(form.weight_kg),
    temperature_c: form.temperature_c.trim() === "" ? null : Number(form.temperature_c),
    cost: form.cost.trim() === "" ? null : Number(form.cost),
    note: form.note.trim() || null,
  };
}

function formatPdfSize(size: number | null) {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MedicalPage() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState<FormState>(buildEmptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId]
  );

  async function loadRecords(nextSelectedId?: number | null) {
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      if (categoryFilter !== "all") qs.set("category", categoryFilter);
      if (keyword.trim()) qs.set("q", keyword.trim());
      const url = `/api/medical-records${qs.toString() ? `?${qs}` : ""}`;
      const res = await apiFetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data?: MedicalRecord[] };
      const nextRecords = json.data ?? [];
      setRecords(nextRecords);

      const wanted = nextSelectedId ?? selectedId;
      if (wanted && nextRecords.some((item) => item.id === wanted)) {
        setSelectedId(wanted);
      } else {
        setSelectedId(nextRecords[0]?.id ?? null);
      }
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
      setRecords([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecords();
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  function openCreate() {
    setMode("create");
    setForm(buildEmptyForm());
    setMsg("");
  }

  function openEdit() {
    if (!selected) return;
    setMode("edit");
    setForm(buildFormFromRecord(selected));
    setMsg("");
  }

  function closeForm() {
    setMode(null);
    setForm(buildEmptyForm());
  }

  async function saveRecord() {
    if (!mode) return;
    if (!form.title.trim()) {
      setMsg("ERROR: 件名を入力してください");
      return;
    }

    setSaving(true);
    setMsg("");
    try {
      const payload = buildPayload(form);
      if (payload.weight_kg !== null && !Number.isFinite(payload.weight_kg)) {
        throw new Error("体重は数値で入力してください");
      }
      if (payload.temperature_c !== null && !Number.isFinite(payload.temperature_c)) {
        throw new Error("体温は数値で入力してください");
      }
      if (payload.cost !== null && !Number.isFinite(payload.cost)) {
        throw new Error("費用は数値で入力してください");
      }

      const isEdit = mode === "edit" && selected;
      const res = await apiFetch(isEdit ? `/api/medical-records/${selected.id}` : "/api/medical-records", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const json = (await res.json()) as { data?: MedicalRecord };
      const saved = json.data ?? null;
      closeForm();
      setMsg(isEdit ? "✅ 医療記録を更新しました" : "✅ 医療記録を追加しました");
      await loadRecords(saved?.id ?? selectedId);
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord() {
    if (!selected) return;
    if (!confirm(`「${selected.title}」を削除しますか？`)) return;

    setMsg("");
    try {
      const res = await apiFetch(`/api/medical-records/${selected.id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setMsg("✅ 医療記録を削除しました");
      await loadRecords(null);
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    }
  }

  async function openPdf(mode: "open" | "download") {
    if (!selected) return;
    setPdfBusy(true);
    setMsg("");
    try {
      const res = await apiFetch(`/api/medical-records/${selected.id}/pdf${mode === "download" ? "?download=1" : ""}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { url?: string | null; pdf_name?: string | null };
      if (!json.url) throw new Error("PDF URLを取得できませんでした");
      if (mode === "open") {
        window.open(json.url, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = json.url;
        a.download = json.pdf_name ?? "medical.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function uploadPdf(file: File) {
    if (!selected) return;
    setUploading(true);
    setMsg("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(`/api/medical-records/${selected.id}/pdf`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setMsg("✅ PDFを添付しました");
      await loadRecords(selected.id);
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePdf() {
    if (!selected?.pdf_path) return;
    if (!confirm("添付PDFを削除しますか？")) return;

    setPdfBusy(true);
    setMsg("");
    try {
      const res = await apiFetch(`/api/medical-records/${selected.id}/pdf`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setMsg("✅ 添付PDFを削除しました");
      await loadRecords(selected.id);
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setPdfBusy(false);
    }
  }

  function onPickPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadPdf(file);
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">医療記録</h1>
          <p className="mt-1 text-sm text-zinc-600">
            左で日付・区分・件名を選び、右で詳細と明細PDFを確認できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openCreate} className="btn">
            新規記録
          </button>
          <button type="button" onClick={() => void loadRecords()} className="btn">
            更新
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={cls(
            "whitespace-pre-wrap text-sm",
            msg.startsWith("ERROR") ? "text-red-600" : "text-emerald-700"
          )}
        >
          {msg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="card p-4">
          <div className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-zinc-700">区分</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="select"
              >
                <option value="all">すべて</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-zinc-700">検索</label>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="input"
                placeholder="件名 / 病院名 / 主訴 など"
              />
            </div>
          </div>

          <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelectedId(record.id)}
                className={cls(
                  "w-full rounded-2xl border p-3 text-left transition",
                  record.id === selectedId
                    ? "border-zinc-900 bg-white shadow-md"
                    : "border-zinc-200 bg-white/70 hover:bg-white"
                )}
              >
                <div className="text-sm font-semibold text-zinc-900">
                  {formatDateTime(record.dt).slice(0, 10)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                    {record.category}
                  </span>
                  {record.pdf_path && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      PDFあり
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-zinc-700">{record.title}</div>
                {record.hospital_name && (
                  <div className="mt-1 text-xs text-zinc-500">{record.hospital_name}</div>
                )}
              </button>
            ))}

            {!loading && records.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                医療記録はまだありません。
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {selected ? (
            <div className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                      {selected.category}
                    </span>
                    <span className="text-sm text-zinc-500">{formatDateTime(selected.dt)}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-zinc-900">{selected.title}</h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openEdit} className="btn">
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={deleteRecord}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100"
                  >
                    削除
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DetailField label="病院名" value={selected.hospital_name} />
                <DetailField label="担当医" value={selected.doctor_name} />
                <DetailField label="次回予定" value={formatDateOnly(selected.next_visit_date)} />
                <DetailField label="費用" value={selected.cost == null ? null : `${selected.cost} 円`} />
                <DetailField label="体重" value={selected.weight_kg == null ? null : `${selected.weight_kg} kg`} />
                <DetailField label="体温" value={selected.temperature_c == null ? null : `${selected.temperature_c} ℃`} />
              </div>

              <div className="mt-4 grid gap-4">
                <DetailBlock label="主訴" value={selected.chief_complaint} />
                <DetailBlock label="所見 / 診断" value={selected.assessment} />
                <DetailBlock label="検査" value={selected.tests} />
                <DetailBlock label="処置 / 処方 / 指示" value={selected.treatment ?? null} />
                <DetailBlock label="投薬" value={selected.medication} />
                <DetailBlock label="自由メモ" value={selected.note} />
              </div>

              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">添付PDF</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      医療明細や検査結果PDFを1件添付できます。
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="btn"
                    >
                      {uploading ? "添付中..." : selected.pdf_path ? "差し替え" : "PDF添付"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf"
                      onChange={onPickPdf}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => void openPdf("open")}
                      disabled={!selected.pdf_path || pdfBusy}
                      className="btn disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      開く
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPdf("download")}
                      disabled={!selected.pdf_path || pdfBusy}
                      className="btn disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ダウンロード
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePdf()}
                      disabled={!selected.pdf_path || pdfBusy}
                      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      PDF削除
                    </button>
                  </div>
                </div>

                {selected.pdf_path ? (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
                    <div className="font-semibold text-zinc-900">{selected.pdf_name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {formatPdfSize(selected.pdf_size)} / 添付日時 {formatDateTime(selected.pdf_uploaded_at)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-zinc-500">PDFは未添付です。</div>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-5">
              <div className="text-lg font-semibold">医療記録の残し方のおすすめ</div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {RECORDING_TIPS.map((tip) => (
                  <div key={tip.title} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-sm font-semibold text-zinc-900">{tip.title}</div>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                      {tip.lines.map((line) => (
                        <li key={line}>・{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {mode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border bg-white p-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {mode === "create" ? "医療記録を追加" : "医療記録を編集"}
                </h2>
                <div className="mt-1 text-sm text-zinc-500">
                  受診1回・症状イベント1回を1件として残すのがおすすめです。
                </div>
              </div>
              <button type="button" onClick={closeForm} className="btn">
                閉じる
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="日時">
                <input
                  type="datetime-local"
                  value={form.dtLocal}
                  onChange={(e) => setForm((prev) => ({ ...prev, dtLocal: e.target.value }))}
                  className="input"
                />
              </Field>

              <Field label="区分">
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="select"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="件名" required>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="input"
                  placeholder="例: 便秘で受診"
                />
              </Field>

              <Field label="病院名">
                <input
                  value={form.hospital_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, hospital_name: e.target.value }))}
                  className="input"
                />
              </Field>

              <Field label="担当医">
                <input
                  value={form.doctor_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, doctor_name: e.target.value }))}
                  className="input"
                />
              </Field>

              <Field label="次回予定">
                <input
                  type="date"
                  value={form.next_visit_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, next_visit_date: e.target.value }))}
                  className="input"
                />
              </Field>

              <Field label="体重(kg)">
                <input
                  inputMode="decimal"
                  value={form.weight_kg}
                  onChange={(e) => setForm((prev) => ({ ...prev, weight_kg: e.target.value }))}
                  className="input"
                />
              </Field>

              <Field label="体温(℃)">
                <input
                  inputMode="decimal"
                  value={form.temperature_c}
                  onChange={(e) => setForm((prev) => ({ ...prev, temperature_c: e.target.value }))}
                  className="input"
                />
              </Field>

              <Field label="費用(円)">
                <input
                  inputMode="numeric"
                  value={form.cost}
                  onChange={(e) => setForm((prev) => ({ ...prev, cost: e.target.value }))}
                  className="input"
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4">
              <Field label="主訴">
                <textarea
                  value={form.chief_complaint}
                  onChange={(e) => setForm((prev) => ({ ...prev, chief_complaint: e.target.value }))}
                  rows={3}
                  className="input min-h-24 resize-y"
                  placeholder="例: 2日排便なし、食欲やや低下"
                />
              </Field>

              <Field label="所見 / 診断">
                <textarea
                  value={form.assessment}
                  onChange={(e) => setForm((prev) => ({ ...prev, assessment: e.target.value }))}
                  rows={3}
                  className="input min-h-24 resize-y"
                />
              </Field>

              <Field label="検査">
                <textarea
                  value={form.tests}
                  onChange={(e) => setForm((prev) => ({ ...prev, tests: e.target.value }))}
                  rows={3}
                  className="input min-h-24 resize-y"
                />
              </Field>

              <Field label="処置 / 処方 / 指示">
                <textarea
                  value={form.treatment}
                  onChange={(e) => setForm((prev) => ({ ...prev, treatment: e.target.value }))}
                  rows={3}
                  className="input min-h-24 resize-y"
                />
              </Field>

              <Field label="投薬">
                <textarea
                  value={form.medication}
                  onChange={(e) => setForm((prev) => ({ ...prev, medication: e.target.value }))}
                  rows={3}
                  className="input min-h-24 resize-y"
                />
              </Field>

              <Field label="自由メモ">
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={4}
                  className="input min-h-28 resize-y"
                />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeForm} className="btn">
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void saveRecord()}
                disabled={saving}
                className="rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-zinc-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </div>
      {children}
    </label>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-900">{value || "—"}</div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">
        {value || "—"}
      </div>
    </div>
  );
}