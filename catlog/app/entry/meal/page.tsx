"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import RecentMeals from "../../../components/RecentMeals";

type Food = {
  id: string | number;
  food_name: string;
  kcal_per_g: number;
};

type MealSetItem = {
  id: number;
  set_id: number;
  sort_no: number;
  food_id: number;
  grams: number;
  note: string | null;
  food_name: string | null;
  kcal_per_g: number | null;
};

type MealSet = {
  id: number;
  set_code: string;
  set_name: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items: MealSetItem[];
};

type EntryMode = "single" | "set";

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MealEntryPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [mealSets, setMealSets] = useState<MealSet[]>([]);
  const [msg, setMsg] = useState("");

  const [mode, setMode] = useState<EntryMode>("single");

  const [dtLocal, setDtLocal] = useState(toDatetimeLocal(new Date()));

  // 単品入力
  const [foodId, setFoodId] = useState<string>("");
  const [grams, setGrams] = useState<string>("");
  const [kcal, setKcal] = useState<string>("");
  const [lastEdited, setLastEdited] = useState<"g" | "k" | null>(null);

  // セット入力
  const [setId, setSetId] = useState<string>("");

  // 直近ログ再読込用
  const [recentKey, setRecentKey] = useState(0);

  const selectedFood = useMemo(() => {
    return foods.find((f) => String(f.id) === String(foodId)) ?? null;
  }, [foods, foodId]);

  const selectedSet = useMemo(() => {
    return mealSets.find((s) => String(s.id) === String(setId)) ?? null;
  }, [mealSets, setId]);

  const selectedSetTotal = useMemo(() => {
    if (!selectedSet) return { grams: 0, kcal: 0 };

    const totalGrams = selectedSet.items.reduce(
      (sum, item) => sum + Number(item.grams ?? 0),
      0
    );

    const totalKcal = selectedSet.items.reduce((sum, item) => {
      const g = Number(item.grams ?? 0);
      const per = Number(item.kcal_per_g ?? 0);
      if (!Number.isFinite(g) || !Number.isFinite(per)) return sum;
      return sum + g * per;
    }, 0);

    return {
      grams: totalGrams,
      kcal: totalKcal,
    };
  }, [selectedSet]);

  // g入力 → kcal自動
  useEffect(() => {
    if (!selectedFood) return;
    if (lastEdited !== "g") return;

    const g = Number(grams);
    if (!g || Number.isNaN(g)) return;

    const k = g * Number(selectedFood.kcal_per_g);
    setKcal(k.toFixed(1));
  }, [grams, selectedFood, lastEdited]);

  // kcal入力 → g自動
  useEffect(() => {
    if (!selectedFood) return;
    if (lastEdited !== "k") return;

    const k = Number(kcal);
    const per = Number(selectedFood.kcal_per_g);
    if (!k || Number.isNaN(k) || !per || Number.isNaN(per)) return;

    const g = k / per;
    setGrams(g.toFixed(1));
  }, [kcal, selectedFood, lastEdited]);

  const loadFoods = async () => {
    const res = await apiFetch("/api/foods");

    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }

    const data = (await res.json()) as Food[];
    const list = data ?? [];
    setFoods(list);

    if (list.length > 0) {
      setFoodId((prev) => prev || String(list[0].id));
    }
  };

  const loadMealSets = async () => {
    const res = await apiFetch("/api/meal-sets");

    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }

    const data = (await res.json()) as MealSet[];
    const list = data ?? [];
    setMealSets(list);

    if (list.length > 0) {
      setSetId((prev) => prev || String(list[0].id));
    }
  };

  useEffect(() => {
    Promise.all([loadFoods(), loadMealSets()]).catch((e: unknown) =>
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
    );
  }, []);

  const resetSingleForm = () => {
    setGrams("");
    setKcal("");
    setLastEdited(null);
  };

  const resetAllForm = () => {
    setDtLocal(toDatetimeLocal(new Date()));
    resetSingleForm();
  };

  const saveSingle = async () => {
    setMsg("");

    if (!foodId) {
      setMsg("フードを選択してください");
      return;
    }

    const g = Number(grams);
    const k = Number(kcal);

    if (!g || Number.isNaN(g)) {
      setMsg("グラム数を入力してください");
      return;
    }

    if (!k || Number.isNaN(k)) {
      setMsg("カロリーが不正です");
      return;
    }

    const res = await apiFetch("/api/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dt: new Date(dtLocal).toISOString(),
        food_id: Number(foodId),
        grams: g,
        kcal: k,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }

    setMsg("単品の給餌を保存しました");
    resetAllForm();
    setRecentKey((v) => v + 1);
  };

  const saveSet = async () => {
    setMsg("");

    if (!setId) {
      setMsg("セットを選択してください");
      return;
    }

    const res = await apiFetch("/api/meal-sets/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        set_id: Number(setId),
        dt: new Date(dtLocal).toISOString(),
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      ok?: boolean;
      set_name?: string;
      inserted_count?: number;
    };

    const savedName = json?.set_name ?? selectedSet?.set_name ?? "セット";
    const insertedCount = Number(json?.inserted_count ?? 0);

    setMsg(
      `${savedName} を実行しました` +
        (insertedCount > 0 ? `（${insertedCount}件登録）` : "")
    );

    setDtLocal(toDatetimeLocal(new Date()));
    setRecentKey((v) => v + 1);
  };

  const onSave = async () => {
    if (mode === "single") {
      await saveSingle();
      return;
    }
    await saveSet();
  };

  const onReloadMaster = async () => {
    setMsg("");
    await Promise.all([loadFoods(), loadMealSets()]);
    setMsg("フード一覧・セット一覧を再読込しました");
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">給餌入力</h1>
          <p className="text-sm text-zinc-500">
            単品入力とセット入力の両方に対応しています
          </p>
        </div>
      </div>

      {/* メッセージ */}
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

      {/* 入力カード */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        {/* モード切替 */}
        <div className="mb-5">
          <div className="mb-2 text-sm font-medium">入力モード</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={
                "rounded-2xl border px-4 py-3 text-sm font-medium " +
                (mode === "single"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "bg-white hover:bg-zinc-50")
              }
            >
              単品入力
            </button>

            <button
              type="button"
              onClick={() => setMode("set")}
              className={
                "rounded-2xl border px-4 py-3 text-sm font-medium " +
                (mode === "set"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "bg-white hover:bg-zinc-50")
              }
            >
              セット入力
            </button>
          </div>
        </div>

        {/* 共通日時 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-sm font-medium">日時</div>
            <input
              type="datetime-local"
              value={dtLocal}
              onChange={(e) => setDtLocal(e.target.value)}
              className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <div className="mt-1 text-xs text-zinc-500">
              デフォルト現在・修正可
            </div>
          </label>

          <div className="block">
            <div className="mb-1 text-sm font-medium">現在の入力方式</div>
            <div className="rounded-2xl border bg-zinc-50 px-3 py-2 text-sm">
              {mode === "single"
                ? "単品のフードを1件だけ登録します"
                : "セット内容を個別明細として一括登録します"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              セット入力でも保存時は各フードが個別行で入ります
            </div>
          </div>
        </div>

        {/* 単品入力 */}
        {mode === "single" && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm font-medium">フード</div>
                <select
                  value={foodId}
                  onChange={(e) => {
                    setFoodId(e.target.value);
                    setLastEdited(null);
                  }}
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                >
                  {(foods ?? []).map((f) => (
                    <option key={String(f.id)} value={String(f.id)}>
                      {f.food_name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-zinc-500">
                  1gあたりkcal：
                  {selectedFood ? Number(selectedFood.kcal_per_g).toFixed(6) : "－"}
                </div>
              </label>
            </div>

            <div>
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

              <div className="mt-2 text-xs text-zinc-500">
                ※ g入力でkcal自動、kcal入力でg自動（フード選択が必要）
              </div>
            </div>
          </div>
        )}

        {/* セット入力 */}
        {mode === "set" && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm font-medium">セット</div>
                <select
                  value={setId}
                  onChange={(e) => setSetId(e.target.value)}
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                >
                  {(mealSets ?? []).map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.set_code}｜{s.set_name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-zinc-500">
                  事前登録した組み合わせを一括で実行します
                </div>
              </label>

              <div className="block">
                <div className="mb-1 text-sm font-medium">セット概要</div>
                <div className="rounded-2xl border bg-zinc-50 px-3 py-3 text-sm">
                  {selectedSet ? (
                    <div className="space-y-1">
                      <div>
                        <span className="font-medium">コード：</span>
                        {selectedSet.set_code}
                      </div>
                      <div>
                        <span className="font-medium">名称：</span>
                        {selectedSet.set_name}
                      </div>
                      <div>
                        <span className="font-medium">合計：</span>
                        {selectedSetTotal.grams.toFixed(1)} g /{" "}
                        {selectedSetTotal.kcal.toFixed(1)} kcal
                      </div>
                      {selectedSet.note && (
                        <div>
                          <span className="font-medium">メモ：</span>
                          {selectedSet.note}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-zinc-500">セットを選択してください</div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">セット内容</div>

              <div className="overflow-x-auto rounded-2xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-3 py-2 text-left">順</th>
                      <th className="px-3 py-2 text-left">フード名</th>
                      <th className="px-3 py-2 text-right">g</th>
                      <th className="px-3 py-2 text-right">kcal/g</th>
                      <th className="px-3 py-2 text-right">kcal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSet?.items?.map((item) => {
                      const g = Number(item.grams ?? 0);
                      const per = Number(item.kcal_per_g ?? 0);
                      const rowKcal =
                        Number.isFinite(g) && Number.isFinite(per) ? g * per : 0;

                      return (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">{item.sort_no}</td>
                          <td className="px-3 py-2">
                            {item.food_name ?? `food_id=${item.food_id}`}
                          </td>
                          <td className="px-3 py-2 text-right">{g.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right">
                            {Number.isFinite(per) ? per.toFixed(3) : "－"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {rowKcal.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}

                    {(!selectedSet || selectedSet.items.length === 0) && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                          セット明細がありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {selectedSet && selectedSet.items.length > 0 && (
                    <tfoot className="border-t bg-zinc-50 font-medium">
                      <tr>
                        <td className="px-3 py-2" colSpan={2}>
                          合計
                        </td>
                        <td className="px-3 py-2 text-right">
                          {selectedSetTotal.grams.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right"> </td>
                        <td className="px-3 py-2 text-right">
                          {selectedSetTotal.kcal.toFixed(1)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                ※ 実行すると、この内容が個別の給餌明細として一括登録されます
              </div>
            </div>
          </div>
        )}

        {/* ボタン */}
        <div className="mt-6 -mx-4 sm:mx-0">
          <div
            className="
              sticky bottom-0 z-50
              flex flex-col gap-3 sm:flex-row
              border-t bg-white/95 backdrop-blur
              px-4 py-3
              pb-[calc(12px+env(safe-area-inset-bottom))]
              sm:rounded-2xl sm:border sm:px-3 sm:py-3
            "
          >
            <button
              onClick={() =>
                onSave().catch((e: unknown) =>
                  setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                )
              }
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:scale-[0.99] sm:flex-1"
            >
              {mode === "single" ? "単品を保存" : "セットを実行"}
            </button>

            <button
              onClick={resetAllForm}
              className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99] sm:flex-1"
            >
              リセット
            </button>

            <button
              onClick={() =>
                onReloadMaster().catch((e: unknown) =>
                  setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                )
              }
              className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99] sm:ml-auto"
            >
              フード・セット一覧を再読込
            </button>
          </div>
        </div>
      </div>

      {/* 直近ログ */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <RecentMeals key={recentKey} limit={20} />
      </div>
    </div>
  );
}