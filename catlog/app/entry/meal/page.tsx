"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import RecentMeals from "../../../components/RecentMeals";

type Food = {
  id: any;
  food_name: string;
  kcal_per_g: number;
};

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function MealEntryPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [msg, setMsg] = useState("");

  const [dtLocal, setDtLocal] = useState(toDatetimeLocal(new Date()));
  const [foodId, setFoodId] = useState<any>("");
  const [grams, setGrams] = useState<string>("");
  const [kcal, setKcal] = useState<string>("");

  const [lastEdited, setLastEdited] = useState<"g" | "k" | null>(null);

  const selected = useMemo(() => {
    return foods.find((f) => String(f.id) === String(foodId)) ?? null;
  }, [foods, foodId]);

  useEffect(() => {
    if (!selected) return;
    if (lastEdited !== "g") return;

    const g = Number(grams);
    if (!g || Number.isNaN(g)) return;

    const k = g * Number(selected.kcal_per_g);
    setKcal(k.toFixed(1));
  }, [grams, selected, lastEdited]);

  useEffect(() => {
    if (!selected) return;
    if (lastEdited !== "k") return;

    const k = Number(kcal);
    if (!k || Number.isNaN(k) || Number(selected.kcal_per_g) === 0) return;

    const g = k / Number(selected.kcal_per_g);
    setGrams(g.toFixed(1));
  }, [kcal, selected, lastEdited]);

  const loadFoods = async () => {
    setMsg("");
    const res = await apiFetch("/api/foods");
    const data = (await res.json()) as Food[];
    setFoods(data ?? []);
    if ((data ?? []).length > 0 && (foodId === "" || foodId == null)) setFoodId((data as any[])[0].id);
  };

  useEffect(() => {
    loadFoods().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setDtLocal(toDatetimeLocal(new Date()));
    setGrams("");
    setKcal("");
    setLastEdited(null);
  };

  const save = async () => {
    setMsg("");
    if (foodId === "" || foodId == null) return setMsg("フードを選択してください");

    const g = Number(grams);
    const k = Number(kcal);
    if (!g || Number.isNaN(g)) return setMsg("グラム数を入力してください");
    if (!k || Number.isNaN(k)) return setMsg("カロリーが不正です");

    await apiFetch("/api/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dt: new Date(dtLocal).toISOString(),
        food_id: foodId,
        grams: g,
        kcal: k,
      }),
    });

    setMsg("保存しました");
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">給餌入力</h1>
          <p className="text-sm text-zinc-500">スマホでも入力しやすいレイアウトにしています</p>
        </div>
      </div>

      {/* メッセージ */}
      {msg && (
        <div
          className={
            "rounded-2xl border px-4 py-3 text-sm " +
            (msg.startsWith("ERROR") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")
          }
        >
          {msg}
        </div>
      )}

      {/* 入力カード */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 日時 */}
          <label className="block">
            <div className="mb-1 text-sm font-medium">日時</div>
            <input
              type="datetime-local"
              value={dtLocal}
              onChange={(e) => setDtLocal(e.target.value)}
              className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <div className="mt-1 text-xs text-zinc-500">デフォルト現在・修正可</div>
          </label>

          {/* フード */}
          <label className="block">
            <div className="mb-1 text-sm font-medium">フード</div>
            <select
              value={foodId === "" || foodId == null ? "" : String(foodId)}
              onChange={(e) => {
                setFoodId(e.target.value || "");
                setLastEdited(null);
              }}
              className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              {foods.map((f) => (
                <option key={String(f.id)} value={String(f.id)}>
                  {f.food_name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-zinc-500">
              1gあたりkcal：{selected ? Number(selected.kcal_per_g).toFixed(6) : "－"}
            </div>
          </label>
        </div>

        {/* 量 */}
        <div className="mt-5">
          <div className="mb-2 text-sm font-medium">量</div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs text-zinc-500">グラム (g)</div>
              <input
                value={grams}
                onChange={(e) => {
                  setLastEdited("g");
                  setGrams(e.target.value);
                }}
                inputMode="decimal"
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-zinc-500">カロリー (kcal)</div>
              <input
                value={kcal}
                onChange={(e) => {
                  setLastEdited("k");
                  setKcal(e.target.value);
                }}
                inputMode="decimal"
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
          </div>

          <div className="mt-2 text-xs text-zinc-500">※ g入力でkcal自動、kcal入力でg自動（フード選択が必要）</div>
        </div>

        {/* ボタン */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => save().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}
            className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:scale-[0.99]"
          >
            保存
          </button>

          <button
            onClick={resetForm}
            className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99]"
          >
            リセット
          </button>

          <button
            onClick={() => loadFoods().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}
            className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99] sm:ml-auto"
          >
            フード一覧を再読込
          </button>
        </div>
      </div>

      {/* 直近ログ */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <RecentMeals limit={20} />
      </div>
    </div>
  );
}
