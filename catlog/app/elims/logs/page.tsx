"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  id: number;
  dt: string;
  stool: string | null;
  urine: string | null;
  urine_ml: number | null;
  amount: number | null;
  note: string | null;
  vomit: boolean;
  kind: string;
  score: number | null;
};

function fmt(dtIso: string) {
  const d = new Date(dtIso);
  return d.toLocaleString("ja-JP", { hour12: false });
}

export default function ElimLogsPage() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const res = await fetch(`/api/elims?days=${days}`, { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text();
      setMsg("ERROR: " + t.slice(0, 200));
      return;
    }
    const json = await res.json();
    setRows(json.data ?? []);
  }

  useEffect(() => { load(); }, [days]);

  async function onDelete(id: number) {
    if (!confirm(`ID=${id} を削除しますか？`)) return;
    setMsg("");
    const res = await fetch(`/api/elims/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      setMsg("ERROR: " + t.slice(0, 200));
      return;
    }
    await load();
    setMsg("✅ 削除しました");
  }

  async function onEdit(id: number) {
    const row = rows.find(r => r.id === id);
    if (!row) return;

    const note = prompt("メモを編集（空なら空でOK）", row.note ?? "");
    if (note === null) return;

    const amountStr = prompt("量を編集（空なら未入力）", row.amount === null ? "" : String(row.amount));
    if (amountStr === null) return;

    const vomit = confirm("嘔吐（vomit）を true にしますか？\nOK=true / キャンセル=false");

    const payload: any = { note: note === "" ? null : note, vomit };

    if (amountStr.trim() === "") payload.amount = null;
    else {
      const n = Number(amountStr);
      if (!Number.isFinite(n)) {
        setMsg("ERROR: amount は数値で入力してね");
        return;
      }
      payload.amount = n;
    }

    setMsg("");
    const res = await fetch(`/api/elims/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      setMsg("ERROR: " + t.slice(0, 200));
      return;
    }

    await load();
    setMsg("✅ 更新しました");
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>排泄ログ（編集/削除）</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <label>
          期間
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ marginLeft: 8, padding: 6 }}>
            <option value={7}>7日</option>
            <option value={14}>14日</option>
            <option value={30}>30日</option>
          </select>
        </label>

        <button onClick={load} style={{ padding: "6px 10px" }}>更新</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Link href="/elims">日別集計へ</Link>
          <Link href="/entry/elim">排泄入力へ</Link>
        </div>
      </div>

      {msg && <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{msg}</div>}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 6 }}>日時</th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 6 }}>うんち</th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 6 }}>おしっこ</th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "right", padding: 6 }}>量</th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 6 }}>メモ</th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "center", padding: 6 }}>嘔吐</th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "center", padding: 6 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                {fmt(r.dt)} <span style={{ color: "#888" }}>#{r.id}</span>
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{r.stool ? "◯" : ""}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{r.urine ? "◯" : ""}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>{r.amount ?? ""}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{r.note ?? ""}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "center" }}>{r.vomit ? "◯" : ""}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "center", whiteSpace: "nowrap" }}>
                <button onClick={() => onEdit(r.id)} style={{ marginRight: 8, padding: "4px 8px" }}>編集</button>
                <button onClick={() => onDelete(r.id)} style={{ padding: "4px 8px" }}>削除</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 10, color: "#666" }}>データがありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
