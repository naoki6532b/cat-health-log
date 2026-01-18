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

  const [weight, setWeight] = useState<string>(""); // kg
  const [memo, setMemo] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit() {
    setMsg("");
    setSaving(true);

    try {
      const dtIso = new Date(dtLocal).toISOString();

      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) {
        setMsg("ERROR: 体重は 0 より大きい数値で入力してね（例: 4.25）");
        return;
      }

      const payload = {
        dt: dtIso,
        weight_kg: w,
        memo: memo.trim() === "" ? null : memo.trim(),
      };

      const res = await apiFetch("/api/weights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text.slice(0, 300) || `HTTP ${res.status}`);
      }

      setMsg("✅ 保存しました");
      setWeight("");
      setMemo("");
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        体重入力
      </h1>

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          日時（修正可）
          <input
            type="datetime-local"
            value={dtLocal}
            onChange={(e) => setDtLocal(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          体重（kg）
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="例: 4.25"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          メモ（任意）
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              resize: "vertical",
            }}
          />
        </label>

        <button
          onClick={onSubmit}
          disabled={saving}
          style={{
            padding: 12,
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          保存
        </button>

        {msg && <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div>}

        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          <Link href="/weights">体重一覧へ</Link>
          <span> / </span>
          <Link href="/">トップへ</Link>
        </div>
      </div>
    </div>
  );
}
