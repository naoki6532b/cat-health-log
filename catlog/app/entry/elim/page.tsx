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

type Kind = "stool" | "urine" | "both";

export default function ElimEntryPage() {
  const defaultDtLocal = useMemo(() => toDatetimeLocalValue(new Date()), []);
  const [dtLocal, setDtLocal] = useState(defaultDtLocal);

  const [kind, setKind] = useState<Kind>("stool");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit() {
    setMsg("");
    setSaving(true);
    try {
      const dtIso = new Date(dtLocal).toISOString();

      const payload: Record<string, unknown> = {
        dt: dtIso,
        kind,
        stool: kind === "stool" || kind === "both" ? "うんち" : null,
        urine: kind === "urine" || kind === "both" ? "おしっこ" : null,
        note: note.trim() === "" ? null : note.trim(),
      };

      const n = amount.trim() === "" ? null : Number(amount);
      if (n !== null && Number.isFinite(n)) payload.amount = n;

      const res = await apiFetch("/api/elims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.slice(0, 400));
      }

      setMsg("✅ 保存しました");
      setNote("");
      setAmount("");
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">排泄入力</h1>
        <div className="mt-1 text-sm text-zinc-600">
          保存はボタン化し、他ページと同じ操作感にそろえています。
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-4">
          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">日時（修正可）</div>
            <input
              type="datetime-local"
              value={dtLocal}
              onChange={(e) => setDtLocal(e.target.value)}
              className="input"
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">種類</div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="select"
            >
              <option value="stool">うんち</option>
              <option value="urine">おしっこ</option>
              <option value="both">両方</option>
            </select>
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">量（任意）</div>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例: 5"
              className="input"
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">メモ（任意）</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="input min-h-24 resize-y"
            />
          </label>

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving}
            className="rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
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
            <Link href="/elims" className="navbtn">
              排泄一覧へ
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