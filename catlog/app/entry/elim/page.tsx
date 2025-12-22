"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ElimEntryPage() {
  const [dtLocal, setDtLocal] = useState(toDatetimeLocal(new Date()));
  const [kind, setKind] = useState<"poop" | "pee">("poop");
  const [score, setScore] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const save = async () => {
    setMsg("");
    await apiFetch("/api/elims", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dt: new Date(dtLocal).toISOString(),
        kind,
        score: score ? Number(score) : null,
        amount: amount ? Number(amount) : null,
        note: note || null,
      }),
    });
    setMsg("保存しました");
    setNote("");
  };

  return (
    <main style={{ padding: 16, maxWidth: 650 }}>
      <h2>排泄入力</h2>
      <div style={{ color: msg.startsWith("ERROR") ? "red" : "green" }}>{msg}</div>

      <div>
        <div>日時（デフォルト現在・修正可）</div>
        <input type="datetime-local" value={dtLocal} onChange={(e) => setDtLocal(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        <div>種類</div>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} style={{ width: "100%" }}>
          <option value="poop">うんち</option>
          <option value="pee">おしっこ</option>
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>状態スコア（任意）</div>
        <input type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="例: 1〜7" style={{ width: "100%" }} />
      </div>

      <div style={{ marginTop: 10 }}>
        <div>量（任意）</div>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例: 1〜5" style={{ width: "100%" }} />
      </div>

      <div style={{ marginTop: 10 }}>
        <div>メモ</div>
        <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={() => save().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>保存</button>
      </div>
    </main>
  );
}