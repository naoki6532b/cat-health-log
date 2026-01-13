"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Search, RefreshCw, Plus, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDesc } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Meal = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
};

type Food = { id: number; food_name: string };

function formatYMD(dt: string) {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(dt: string) {
  const d = new Date(dt);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export default function MealsPage() {
  const [rows, setRows] = useState<Meal[]>([]);
  const [foodsMap, setFoodsMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setMsg("");
    setLoading(true);
    try {
      const foodsRes = await apiFetch("/api/foods");
      if (!foodsRes.ok) throw new Error(await foodsRes.text());
      const foods = (await foodsRes.json()) as Food[];
      const map: Record<string, string> = {};
      for (const f of foods ?? []) map[String(f.id)] = f.food_name;
      setFoodsMap(map);

      // 多めに取ってクライアントでフィルタ（UIが速い）
      const res = await apiFetch(`/api/meals/recent?limit=500`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Meal[];
      setRows(data ?? []);
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const name = r.food_id != null ? foodsMap[String(r.food_id)] ?? String(r.food_id) : "";
      const note = r.note ?? "";
      const ymd = formatYMD(r.dt);
      return (
        name.toLowerCase().includes(s) ||
        note.toLowerCase().includes(s) ||
        ymd.includes(s) ||
        String(r.grams ?? "").includes(s) ||
        String(r.kcal ?? "").includes(s)
      );
    });
  }, [q, rows, foodsMap]);

  const grouped = useMemo(() => {
    const g: Record<string, Meal[]> = {};
    for (const r of filtered) {
      const key = formatYMD(r.dt);
      (g[key] ??= []).push(r);
    }
    // 日付降順
    const keys = Object.keys(g).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({ day: k, items: g[k] }));
  }, [filtered]);

  const totalKcal = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (Number(r.kcal) || 0), 0);
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">給餌一覧</h1>
          <p className="text-sm text-zinc-500">
            検索・日付ごと表示。スマホはカード、PCは情報量多めで見やすく。
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/entry/meal">
            <Button className="rounded-2xl">
              <Plus size={16} /> 新規入力
            </Button>
          </Link>
          <Button variant="secondary" onClick={load} disabled={loading} className="rounded-2xl">
            <RefreshCw size={16} /> 更新
          </Button>
        </div>
      </div>

      {msg && (
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
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>ログ</CardTitle>
            <CardDesc>検索して絞り込みできます（フード名/日付/メモ/g/kcal）</CardDesc>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge className="bg-white/80">合計 kcal（表示中）: {totalKcal.toFixed(1)}</Badge>
            <div className="text-xs text-zinc-500">
              件数: {filtered.length}（全体 {rows.length}）
            </div>
          </div>
        </CardHeader>

        <div className="px-6 pb-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="例: 2026-01-13 / k9 / 23.4 / メモ…"
              className="pl-10"
            />
          </div>

          <div className="mt-5 space-y-4">
            {grouped.map(({ day, items }) => {
              const dayTotal = items.reduce((sum, r) => sum + (Number(r.kcal) || 0), 0);
              return (
                <div key={day} className="rounded-3xl border bg-white/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{day}</div>
                    <Badge>合計 {dayTotal.toFixed(1)} kcal</Badge>
                    <Badge className="bg-zinc-50">件数 {items.length}</Badge>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {items.map((r) => {
                      const foodName =
                        r.food_id != null ? foodsMap[String(r.food_id)] ?? String(r.food_id) : "-";
                      const neg = (Number(r.grams) || 0) < 0 || (Number(r.kcal) || 0) < 0;
                      return (
                        <Link
                          key={r.id}
                          href={`/meals/${r.id}`}
                          className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold">{formatTime(r.dt)}</div>
                                {neg && <Badge className="border-red-200 bg-red-50 text-red-700">要確認</Badge>}
                              </div>

                              <div className="mt-1 text-sm text-zinc-800">
                                <span className="font-medium">{foodName}</span>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                                <span className="rounded-full bg-zinc-100 px-2 py-1">g: {r.grams ?? "-"}</span>
                                <span className="rounded-full bg-zinc-100 px-2 py-1">kcal: {r.kcal ?? "-"}</span>
                              </div>

                              {r.note && <div className="mt-2 text-sm text-zinc-600">メモ: {r.note}</div>}
                            </div>

                            <ChevronRight className="mt-1 text-zinc-300 transition group-hover:text-zinc-400" size={18} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {grouped.length === 0 && (
              <div className="rounded-2xl border bg-white px-4 py-6 text-sm text-zinc-500">
                まだログがありません（または検索条件に一致しません）
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
