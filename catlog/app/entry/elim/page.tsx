"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ElimEntryPage() {
  const defaultDtLocal = useMemo(() => toDatetimeLocalValue(new Date()), []);
  const [dtLocal, setDtLocal] = useState(defaultDtLocal);

  // kind: stool / urine / both
  const [kind, setKind] = useState<"stool" | "urine" | "both">("stool");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit() {
    setMsg("");
    setSaving(true);
    try {
      // datetime-local はローカル時刻として Date に入る（日本のPCならJSTでOK）
      const dtIso = new Date(dtLocal).toISOString();

      const payload: any = {
        dt: dtIso,
        stool: kind === "stool" || kind === "both" ? "うんち" : null,
        urine: kind === "urine" || kind === "both" ? "おしっこ" : null,
        note: note || null,
      };

      const n = amount.trim() === "" ? null : Number(amount);
      if (n !== null && Number.isFinite(n)) payload.amount = n;

      const res = await fetch("/api/elims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.slice(0, 300));
      }

      setMsg("✅ 保存しました");
      // 保存後にメモだけクリア（必要なら全部クリアに変更OK）
      setNote("");
      setAmount("");
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>排泄入力</h1>

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
          種類
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          >
            <option value="stool">うんち</option>
            <option value="urine">おしっこ</option>
            <option value="both">両方</option>
          </select>
        </label>

        <label>
          量（任意）
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例: 5"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          メモ（任意）
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: 10, marginTop: 6, resize: "vertical" }}
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
          <Link href="/elims">排泄一覧へ</Link>
          <span> / </span>
          <Link href="/">トップへ</Link>
        </div>
      </div>
    </div>
  );
}
