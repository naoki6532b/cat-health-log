"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Row = {
  id: number;
  dt: string;
  weight_kg: number;
  memo: string | null;
};

function fmt(dtIso: string) {
  const d = new Date(dtIso);
  return d.toLocaleString("ja-JP", { hour12: false });
}

export default function WeightsPage() {
  const [days, setDays] = useState<30 | 90 | 365 | 3650>(365);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const res = await apiFetch(`/api/weights?days=${days}`);

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setMsg("ERROR: " + (t || `HTTP ${res.status}`).slice(0, 300));
      setRows([]);
      return;
    }

    const json = await res.json();
    setRows(json.data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const avg = useMemo(() => {
    if (rows.length === 0) return null;
    const sum = rows.reduce((a, r) => a + (r.weight_kg ?? 0), 0);
    return sum / rows.length;
  }, [rows]);

  async function onDelete(id: number) {
    if (!confirm(`ID=${id} を削除しますか？`)) return;
    setMsg("");

    const res = await apiFetch(`/api/weights/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setMsg("ERROR: " + (t || `HTTP ${res.status}`).slice(0, 300));
      return;
    }

    await load();
    setMsg("✅ 削除しました");
  }

  async function onEdit(id: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    const wStr = prompt("体重(kg) を編集", String(row.weight_kg));
    if (wStr === null) return;

    const w = Number(wStr);
    if (!Number.isFinite(w) || w <= 0) {
      setMsg("ERROR: 体重は正の数で入力してね");
      return;
    }

    const memo = prompt("メモ（空なら空でOK）", row.memo ?? "");
    if (memo === null) return;

    setMsg("");
    const res = await apiFetch(`/api/weights/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weight_kg: w, memo: memo === "" ? null : memo }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setMsg("ERROR: " + (t || `HTTP ${res.status}`).slice(0, 300));
      return;
    }

    await load();
    setMsg("✅ 更新しました");
  }

  return (
    <main className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">体重 一覧（編集/削除）</h1>
          <div className="mt-1 text-sm text-zinc-600">
            件数：{rows.length} 件{avg !== null ? ` / 平均 ${avg.toFixed(2)} kg` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/entry/weight" className="navbtn">
            体重入力へ
          </Link>
          <button onClick={load} className="navbtn">
            更新
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { v: 30 as const, label: "30日" },
          { v: 90 as const, label: "90日" },
          { v: 365 as const, label: "1年" },
          { v: 3650 as const, label: "全部" },
        ].map((x) => (
          <button
            key={x.v}
            onClick={() => setDays(x.v)}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition " +
              (days === x.v ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50")
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={"text-sm whitespace-pre-wrap break-words " + (msg.startsWith("ERROR") ? "text-red-600" : "text-emerald-700")}>
          {msg}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-4 border-b bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600">
          <div>日時</div>
          <div className="text-right">体重(kg)</div>
          <div>メモ</div>
          <div className="text-center">操作</div>
        </div>

        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-4 items-center gap-2 px-4 py-3">
              <div className="text-sm font-semibold">
                {fmt(r.dt)} <span className="text-zinc-400">#{r.id}</span>
              </div>

              <div className="text-right text-sm font-semibold">{r.weight_kg.toFixed(2)}</div>

              <div className="text-sm text-zinc-700">{r.memo ?? ""}</div>

              <div className="flex justify-center gap-2 whitespace-nowrap">
                <button onClick={() => onEdit(r.id)} className="navbtn">
                  編集
                </button>
                <button onClick={() => onDelete(r.id)} className="navbtn">
                  削除
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-600">データがありません</div>
          )}
        </div>
      </div>

      <div className="text-sm text-zinc-600">
        <Link href="/summary" className="underline">
          集計へ
        </Link>{" "}
        /{" "}
        <Link href="/" className="underline">
          トップへ
        </Link>
      </div>
    </main>
  );
}
