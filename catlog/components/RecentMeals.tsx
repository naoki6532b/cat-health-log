"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Meal = {
  id: number;
  dt: string;
  food_name?: string | null;
  food_id?: number | null;
  grams: number | null;
  kcal: number | null;
  note?: string | null;
};

function fmtJst(dtIso: string) {
  // ISO文字列を "YYYY/MM/DD HH:mm" くらいで表示
  const d = new Date(dtIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${y}/${m}/${da} ${h}:${mi}`;
}

export default function RecentMeals({ limit = 20 }: { limit?: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Meal[]>([]);
  const [msg, setMsg] = useState<string>("");

  const reload = useCallback(async () => {
    setMsg("");
    const res = await apiFetch(`/api/meals/recent?limit=${encodeURIComponent(String(limit))}`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as Meal[];
    setItems(Array.isArray(data) ? data : []);
  }, [limit]);

  useEffect(() => {
    reload().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
  }, [reload]);

  const onEdit = (id: number) => {
    // 編集ページへ
    router.push(`/meals/${id}`);
  };

  const onDelete = async (id: number) => {
    const ok = window.confirm("この給餌ログを削除しますか？");
    if (!ok) return;

    setMsg("");
    const res = await apiFetch(`/api/meals/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    setMsg("削除しました");
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">直近の給餌ログ</h2>
          <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-600">修正/削除</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50 active:scale-[0.99]"
            onClick={() => reload().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}
          >
            更新
          </button>

          <button
            type="button"
            className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50 active:scale-[0.99]"
            onClick={() => router.push("/meals")}
          >
            全一覧へ
          </button>
        </div>
      </div>

      {msg ? (
        <div
          className={
            "rounded-2xl border px-4 py-3 text-sm " +
            (msg.startsWith("ERROR")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700")
          }
        >
          {msg}
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((m) => (
          <div key={m.id} className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold">{fmtJst(m.dt)}</div>
                <div className="mt-1 text-sm text-zinc-700">
                  フード：{m.food_name ?? "（不明）"}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                    g: {m.grams ?? "－"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                    kcal: {m.kcal ?? "－"}
                  </span>
                  {m.note ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      note: {m.note}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* 右側ボタン（スマホで確実に反応させる） */}
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  className="relative z-10 touch-manipulation select-none rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(m.id);
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(m.id);
                  }}
                >
                  修正
                </button>

                <button
                  type="button"
                  className="relative z-10 touch-manipulation select-none rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-500 active:scale-[0.99]"
                  style={{ pointerEvents: "auto" }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(m.id).catch((err) => setMsg("ERROR: " + String(err?.message ?? err)));
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(m.id).catch((err) => setMsg("ERROR: " + String(err?.message ?? err)));
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-500">
            直近の給餌ログはありません
          </div>
        ) : null}
      </div>
    </div>
  );
}
