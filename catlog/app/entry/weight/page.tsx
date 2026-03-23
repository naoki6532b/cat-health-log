"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function WeightEntryPage() {
  const defaultDtLocal = useMemo(() => toDatetimeLocalValue(new Date()), []);
  const [dtLocal, setDtLocal] = useState(defaultDtLocal);

  const [weightKg, setWeightKg] = useState<string>("");
  const [memo, setMemo] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit() {
    setMsg("");
    setSaving(true);

    try {
      const w = Number(weightKg);

      if (!Number.isFinite(w) || w <= 0) {
        setMsg("ERROR: 体重は正の数で入力してください");
        return;
      }

      const dtIso = new Date(dtLocal).toISOString();

      const res = await apiFetch("/api/weights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dt: dtIso,
          weight_kg: w,
          memo: memo.trim() === "" ? null : memo.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error((text || `HTTP ${res.status}`).slice(0, 400));
      }

      setMsg("✅ 保存しました");
      setWeightKg("");
      setMemo("");
      setDtLocal(toDatetimeLocalValue(new Date()));
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">体重入力</h1>
        <div className="mt-1 text-sm text-zinc-600">
          体重を登録します。日時は必要に応じて修正できます。
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-4">
          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">日時</div>
            <input
              type="datetime-local"
              value={dtLocal}
              onChange={(e) => setDtLocal(e.target.value)}
              className="input"
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">体重(kg)</div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="例: 4.35"
              className="input"
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">メモ（任意）</div>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="input min-h-24 resize-y"
              placeholder="例: 食後 / 病院 / 家の体重計"
            />
          </label>

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving}
            className="rounded-2xl border border-sky-200 bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存"}
          </button>

          {msg && (
            <div
              className={
                msg.startsWith("ERROR")
                  ? "whitespace-pre-wrap text-sm text-red-600"
                  : "whitespace-pre-wrap text-sm text-emerald-700"
              }
            >
              {msg}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/weights" className="navbtn">
              体重一覧へ
            </Link>
            <Link href="/summary" className="navbtn">
              集計へ
            </Link>
            <Link href="/" className="navbtn">
              トップへ
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}