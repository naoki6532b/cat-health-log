"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

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

type Kind = "stool" | "urine" | "both";

type EditState = {
  id: number;
  dtLocal: string;
  kind: Kind;
  amount: string;
  note: string;
  vomit: boolean;
};

function fmt(dtIso: string) {
  const d = new Date(dtIso);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });
}

function toDatetimeLocalValue(dtIso: string) {
  const d = new Date(dtIso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}

function detectKind(row: Row): Kind {
  const kind = String(row.kind ?? "").trim();
  if (kind === "both") return "both";
  if (kind === "stool") return "stool";
  if (kind === "urine") return "urine";
  if (row.stool && row.urine) return "both";
  if (row.urine) return "urine";
  return "stool";
}

export default function ElimLogsPage() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setMsg("");

    const res = await apiFetch(`/api/elims?days=${days}`);

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setMsg("ERROR: " + (t || `HTTP ${res.status}`).slice(0, 200));
      setRows([]);
      return;
    }

    const json = (await res.json()) as { data?: Row[] };
    setRows(json.data ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const editingTitle = useMemo(() => {
    if (!editing) return "";
    return `ID=${editing.id} を編集中`;
  }, [editing]);

  async function onDelete(id: number) {
    if (!confirm(`ID=${id} を削除しますか？`)) return;

    setMsg("");
    const res = await apiFetch(`/api/elims/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setMsg("ERROR: " + (t || `HTTP ${res.status}`).slice(0, 200));
      return;
    }

    await load();
    setMsg("✅ 削除しました");
    if (editing?.id === id) setEditing(null);
  }

  function beginEdit(row: Row) {
    setEditing({
      id: row.id,
      dtLocal: toDatetimeLocalValue(row.dt),
      kind: detectKind(row),
      amount: row.amount === null ? "" : String(row.amount),
      note: row.note ?? "",
      vomit: row.vomit,
    });
    setMsg("");
  }

  async function onSaveEdit() {
    if (!editing) return;

    setMsg("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        dt: new Date(editing.dtLocal).toISOString(),
        kind: editing.kind,
        amount: editing.amount.trim() === "" ? null : Number(editing.amount),
        note: editing.note.trim() === "" ? null : editing.note.trim(),
        vomit: editing.vomit,
      };

      if (
        payload.amount !== null &&
        (!Number.isFinite(payload.amount as number) || Number(payload.amount) < 0)
      ) {
        setMsg("ERROR: 量は数値で入力してください");
        return;
      }

      const res = await apiFetch(`/api/elims/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setMsg("ERROR: " + (t || `HTTP ${res.status}`).slice(0, 200));
        return;
      }

      await load();
      setEditing(null);
      setMsg("✅ 更新しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">排泄ログ（編集/削除）</h1>
          <div className="mt-1 text-sm text-zinc-600">
            編集では日時・うんち/おしっこ種別・量・メモ・嘔吐を変更できます。
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-700">
            期間
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="select ml-2 w-auto"
            >
              <option value={7}>7日</option>
              <option value={14}>14日</option>
              <option value={30}>30日</option>
            </select>
          </label>

          <button type="button" onClick={load} className="btn">
            更新
          </button>

          <Link href="/elims" className="navbtn">
            日別集計へ
          </Link>
          <Link href="/entry/elim" className="navbtn">
            排泄入力へ
          </Link>
        </div>
      </div>

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

      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-700">
              <th className="border-b px-3 py-3 text-left">日時</th>
              <th className="border-b px-3 py-3 text-left">種別</th>
              <th className="border-b px-3 py-3 text-right">量</th>
              <th className="border-b px-3 py-3 text-left">メモ</th>
              <th className="border-b px-3 py-3 text-center">嘔吐</th>
              <th className="border-b px-3 py-3 text-center">操作</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-zinc-50/50">
                <td className="border-b px-3 py-3 align-top">
                  <div className="font-medium text-zinc-800">{fmt(r.dt)}</div>
                  <div className="mt-1 text-xs text-zinc-500">#{r.id}</div>
                </td>
                <td className="border-b px-3 py-3 align-top">
                  {detectKind(r) === "both"
                    ? "両方"
                    : detectKind(r) === "stool"
                      ? "うんち"
                      : "おしっこ"}
                </td>
                <td className="border-b px-3 py-3 text-right align-top">{r.amount ?? ""}</td>
                <td className="border-b px-3 py-3 align-top">{r.note ?? ""}</td>
                <td className="border-b px-3 py-3 text-center align-top">
                  {r.vomit ? "◯" : ""}
                </td>
                <td className="border-b px-3 py-3 text-center align-top whitespace-nowrap">
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(r)}
                      className="btn px-3 py-1.5 text-xs"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="rounded-2xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-3xl border bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">排泄ログを編集</h2>
                <div className="mt-1 text-sm text-zinc-500">{editingTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                閉じる
              </button>
            </div>

            <div className="grid gap-4">
              <label className="block text-sm">
                <div className="mb-1 font-medium text-zinc-700">日時</div>
                <input
                  type="datetime-local"
                  value={editing.dtLocal}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, dtLocal: e.target.value } : prev))
                  }
                  className="input"
                />
              </label>

              <label className="block text-sm">
                <div className="mb-1 font-medium text-zinc-700">うんち / おしっこ</div>
                <select
                  value={editing.kind}
                  onChange={(e) =>
                    setEditing((prev) =>
                      prev ? { ...prev, kind: e.target.value as Kind } : prev
                    )
                  }
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
                  inputMode="decimal"
                  value={editing.amount}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, amount: e.target.value } : prev))
                  }
                  className="input"
                  placeholder="例: 5"
                />
              </label>

              <label className="block text-sm">
                <div className="mb-1 font-medium text-zinc-700">メモ（任意）</div>
                <textarea
                  value={editing.note}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                  }
                  rows={4}
                  className="input min-h-24 resize-y"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={editing.vomit}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, vomit: e.target.checked } : prev))
                  }
                />
                嘔吐あり
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn">
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void onSaveEdit()}
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