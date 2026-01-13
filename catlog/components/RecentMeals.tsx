"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Meal = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
};

type Food = { id: number; food_name: string };

export default function RecentMeals({ limit = 20 }: { limit?: number }) {
  const [rows, setRows] = useState<Meal[]>([]);
  const [foodsMap, setFoodsMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const foodsRes = await apiFetch("/api/foods");
      if (!foodsRes.ok) throw new Error(await foodsRes.text());
      const foods = (await foodsRes.json()) as Food[];
      const map: Record<string, string> = {};
      for (const f of foods ?? []) map[String(f.id)] = f.food_name;
      setFoodsMap(map);

      const res = await apiFetch(`/api/meals/recent?limit=${limit}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Meal[];
      setRows(data ?? []);
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e ?? "unknown"));
    }
  };

  const del = async (id: number) => {
    if (!confirm("この給餌ログを削除しますか？")) return;
    setMsg("");
    try {
      const res = await apiFetch(`/api/meals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await load();
      setMsg("削除しました");
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e ?? "unknown"));
    }
  };

  useEffect(() => {
    load();
  }, [limit]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">直近の給餌ログ</h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">修正/削除</span>

        <button
          onClick={load}
          className="ml-auto rounded-xl border bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
        >
          更新
        </button>

        <Link href="/meals" className="rounded-xl border bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">
          全一覧へ
        </Link>
      </div>

      {msg && (
        <div
          className={
            "rounded-2xl border px-4 py-2 text-sm " +
            (msg.startsWith("ERROR") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")
          }
        >
          {msg}
        </div>
      )}

      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={String(r.id)} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{new Date(r.dt).toLocaleString("ja-JP")}</div>
                <div className="mt-1 text-sm text-zinc-700">
                  <span className="font-medium">フード:</span>{" "}
                  {r.food_id != null ? foodsMap[String(r.food_id)] ?? String(r.food_id) : "-"}
                </div>

                <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-600">
                  <span className="rounded-full bg-zinc-100 px-2 py-1">g: {r.grams ?? "-"}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-1">kcal: {r.kcal ?? "-"}</span>
                </div>

                {r.note && <div className="mt-2 text-sm text-zinc-600">メモ: {r.note}</div>}
              </div>

              <div className="flex gap-2 sm:flex-col sm:items-stretch">
                <Link
                  href={`/meals/${String(r.id)}`}
                  className="inline-flex items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  修正
                </Link>
                <button
                  onClick={() => del(r.id)}
                  className="inline-flex items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && <div className="text-sm text-zinc-500">まだ給餌ログがありません</div>}
      </div>
    </section>
  );
}
