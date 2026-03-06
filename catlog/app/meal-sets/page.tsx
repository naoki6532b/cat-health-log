"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Food = {
  id: number;
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

type DraftItem = {
  food_id: string;
  grams: string;
  note: string;
};

function fmtDateTime(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ja-JP");
}

export default function MealSetsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [mealSets, setMealSets] = useState<MealSet[]>([]);
  const [msg, setMsg] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);

  const [setCode, setSetCode] = useState("");
  const [setName, setSetName] = useState("");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [items, setItems] = useState<DraftItem[]>([
    { food_id: "", grams: "", note: "" },
  ]);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const foodMap = useMemo(() => {
    const map = new Map<number, Food>();
    for (const f of foods) {
      map.set(Number(f.id), f);
    }
    return map;
  }, [foods]);

  const draftTotal = useMemo(() => {
    let grams = 0;
    let kcal = 0;

    for (const item of items) {
      const g = Number(item.grams);
      const foodId = Number(item.food_id);
      const food = foodMap.get(foodId);

      if (Number.isFinite(g) && g > 0) {
        grams += g;
        if (food) {
          kcal += g * Number(food.kcal_per_g);
        }
      }
    }

    return { grams, kcal };
  }, [items, foodMap]);

  const loadAll = async () => {
    setMsg("");
    setLoading(true);

    const [foodsRes, setsRes] = await Promise.all([
      apiFetch("/api/foods"),
      apiFetch("/api/meal-sets?include_inactive=1"),
    ]);

    if (!foodsRes.ok) {
      throw new Error((await foodsRes.text()) || `foods HTTP ${foodsRes.status}`);
    }
    if (!setsRes.ok) {
      throw new Error((await setsRes.text()) || `meal-sets HTTP ${setsRes.status}`);
    }

    const foodsJson = (await foodsRes.json()) as Food[];
    const setsJson = (await setsRes.json()) as MealSet[];

    const foodList = foodsJson ?? [];
    const setList = setsJson ?? [];

    setFoods(foodList);
    setMealSets(setList);

    setItems((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          food_id: foodList[0] ? String(foodList[0].id) : "",
          grams: "",
          note: "",
        },
      ];
    });

    setLoading(false);
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        await loadAll();
      } catch (e: unknown) {
        if (!alive) return;
        setLoading(false);
        setMsg("ERROR: " + String(e instanceof Error ? e.message : e));
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (foods.length === 0) return;

    setItems((prev) =>
      prev.map((item) =>
        item.food_id
          ? item
          : { ...item, food_id: String(foods[0].id) }
      )
    );
  }, [foods]);

  const resetForm = () => {
    setEditingId(null);
    setSetCode("");
    setSetName("");
    setNote("");
    setIsActive(true);
    setItems([
      {
        food_id: foods[0] ? String(foods[0].id) : "",
        grams: "",
        note: "",
      },
    ]);
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        food_id: foods[0] ? String(foods[0].id) : "",
        grams: "",
        note: "",
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) {
        return [
          {
            food_id: foods[0] ? String(foods[0].id) : "",
            grams: "",
            note: "",
          },
        ];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const moveItemUp = (index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const next = [...prev];
      const tmp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = tmp;
      return next;
    });
  };

  const moveItemDown = (index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = tmp;
      return next;
    });
  };

  const updateItem = (
    index: number,
    key: keyof DraftItem,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const loadSetToForm = (setRow: MealSet, asCopy: boolean) => {
    if (asCopy) {
      setEditingId(null);
      setSetCode(`${setRow.set_code}_COPY`);
      setSetName(`${setRow.set_name} コピー`);
    } else {
      setEditingId(setRow.id);
      setSetCode(setRow.set_code);
      setSetName(setRow.set_name);
    }

    setNote(setRow.note ?? "");
    setIsActive(setRow.is_active);
    setItems(
      setRow.items.map((item) => ({
        food_id: String(item.food_id),
        grams: String(item.grams),
        note: item.note ?? "",
      }))
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
    setMsg(
      asCopy
        ? `「${setRow.set_name}」をコピー用に読み込みました`
        : `「${setRow.set_name}」を編集モードで読み込みました`
    );
  };

  const buildPayload = () => {
    const code = setCode.trim();
    const name = setName.trim();
    const memo = note.trim();

    if (!code) {
      throw new Error("セットコードを入力してください");
    }
    if (!name) {
      throw new Error("セット名を入力してください");
    }
    if (items.length === 0) {
      throw new Error("明細を1件以上入れてください");
    }

    const normalized = items.map((item, idx) => ({
      sort_no: idx + 1,
      food_id: Number(item.food_id),
      grams: Number(item.grams),
      note: item.note.trim() || null,
    }));

    for (const row of normalized) {
      if (!row.food_id || !Number.isFinite(row.food_id)) {
        throw new Error("明細のフードを選択してください");
      }
      if (!row.grams || !Number.isFinite(row.grams) || row.grams <= 0) {
        throw new Error("明細のg数を正しく入力してください");
      }
    }

    return {
      set_code: code,
      set_name: name,
      note: memo || null,
      is_active: isActive,
      items: normalized,
    };
  };

  const saveSet = async () => {
    setMsg("");
    setSaving(true);

    try {
      const payload = buildPayload();

      const res = editingId
        ? await apiFetch(`/api/meal-sets/${editingId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/meal-sets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      await loadAll();
      const saveLabel = editingId ? "更新しました" : "保存しました";
      resetForm();
      setMsg(`セットを${saveLabel}`);
    } catch (e: unknown) {
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (setRow: MealSet) => {
    setMsg("");

    try {
      const res = await apiFetch(`/api/meal-sets/${setRow.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          is_active: !setRow.is_active,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      await loadAll();
      setMsg(
        !setRow.is_active
          ? `「${setRow.set_name}」を有効にしました`
          : `「${setRow.set_name}」を停止しました`
      );
    } catch (e: unknown) {
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e));
    }
  };

  const deleteSet = async (setRow: MealSet) => {
    if (!confirm(`「${setRow.set_name}」を削除しますか？`)) return;

    setMsg("");

    try {
      const res = await apiFetch(`/api/meal-sets/${setRow.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      await loadAll();

      if (editingId === setRow.id) {
        resetForm();
      }

      setMsg(`「${setRow.set_name}」を削除しました`);
    } catch (e: unknown) {
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">セット管理</h1>
          <p className="text-sm text-zinc-500">
            給餌セットの登録・編集・停止・削除ができます
          </p>
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

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-lg font-semibold">
              {editingId ? "セット編集" : "新規セット作成"}
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              {editingId ? "編集解除" : "フォーム初期化"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium">セットコード</div>
              <input
                value={setCode}
                onChange={(e) => setSetCode(e.target.value)}
                placeholder="例：AM001"
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-sm font-medium">セット名</div>
              <input
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="例：朝セットA"
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <div className="mb-1 text-sm font-medium">メモ</div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：ラグドール10・犬猫10・クランキー7・K9 6"
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>

            <label className="mt-7 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              有効
            </label>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">セット明細</div>
              <button
                type="button"
                onClick={addItem}
                className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                明細を追加
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const selectedFood = foods.find(
                  (f) => String(f.id) === String(item.food_id)
                );
                const gramsNum = Number(item.grams);
                const rowKcal =
                  selectedFood && Number.isFinite(gramsNum)
                    ? gramsNum * Number(selectedFood.kcal_per_g)
                    : 0;

                return (
                  <div
                    key={index}
                    className="rounded-2xl border bg-zinc-50/60 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        明細 {index + 1}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => moveItemUp(index)}
                          className="rounded-xl border bg-white px-3 py-1 text-xs hover:bg-zinc-50"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItemDown(index)}
                          className="rounded-xl border bg-white px-3 py-1 text-xs hover:bg-zinc-50"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="rounded-xl border bg-white px-3 py-1 text-xs hover:bg-zinc-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1.6fr_0.8fr]">
                      <label className="block">
                        <div className="mb-1 text-xs text-zinc-500">フード</div>
                        <select
                          value={item.food_id}
                          onChange={(e) =>
                            updateItem(index, "food_id", e.target.value)
                          }
                          className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                        >
                          {(foods ?? []).map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.food_name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <div className="mb-1 text-xs text-zinc-500">g数</div>
                        <input
                          value={item.grams}
                          onChange={(e) =>
                            updateItem(index, "grams", e.target.value)
                          }
                          inputMode="decimal"
                          className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                        />
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <label className="block">
                        <div className="mb-1 text-xs text-zinc-500">明細メモ</div>
                        <input
                          value={item.note}
                          onChange={(e) =>
                            updateItem(index, "note", e.target.value)
                          }
                          placeholder="任意"
                          className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                        />
                      </label>

                      <div className="rounded-2xl border bg-white px-3 py-2 text-sm">
                        <div>
                          kcal/g：
                          {selectedFood ? Number(selectedFood.kcal_per_g).toFixed(3) : "－"}
                        </div>
                        <div>kcal：{Number.isFinite(rowKcal) ? rowKcal.toFixed(1) : "－"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium">合計</div>
              <div className="mt-1">
                {draftTotal.grams.toFixed(1)} g / {draftTotal.kcal.toFixed(1)} kcal
              </div>
            </div>
          </div>

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
                type="button"
                onClick={() => {
                  void saveSet();
                }}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 sm:flex-1"
              >
                {saving
                  ? "保存中..."
                  : editingId
                    ? "セットを更新"
                    : "セットを保存"}
              </button>

              <button
                type="button"
                onClick={() => {
                  void loadAll().catch((e: unknown) =>
                    setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                  );
                }}
                className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 sm:flex-1"
              >
                一覧を再読込
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-lg font-semibold">登録済みセット一覧</div>
            <div className="text-sm text-zinc-500">
              {loading ? "読込中..." : `${mealSets.length}件`}
            </div>
          </div>

          <div className="space-y-4">
            {mealSets.map((setRow) => {
              const totalGrams = setRow.items.reduce(
                (sum, item) => sum + Number(item.grams ?? 0),
                0
              );
              const totalKcal = setRow.items.reduce((sum, item) => {
                const g = Number(item.grams ?? 0);
                const per = Number(item.kcal_per_g ?? 0);
                if (!Number.isFinite(g) || !Number.isFinite(per)) return sum;
                return sum + g * per;
              }, 0);

              return (
                <div key={setRow.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold">
                          {setRow.set_code}
                        </div>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs " +
                            (setRow.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-zinc-100 text-zinc-600")
                          }
                        >
                          {setRow.is_active ? "有効" : "停止"}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        {setRow.set_name}
                      </div>
                      {setRow.note && (
                        <div className="mt-1 text-sm text-zinc-500">
                          {setRow.note}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => loadSetToForm(setRow, false)}
                        className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                      >
                        編集
                      </button>

                      <button
                        type="button"
                        onClick={() => loadSetToForm(setRow, true)}
                        className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                      >
                        複製
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void toggleActive(setRow);
                        }}
                        className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                      >
                        {setRow.is_active ? "停止" : "有効化"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void deleteSet(setRow);
                        }}
                        className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-2xl border">
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
                        {setRow.items.map((item) => {
                          const rowKcal =
                            Number(item.grams ?? 0) * Number(item.kcal_per_g ?? 0);

                          return (
                            <tr key={item.id} className="border-t">
                              <td className="px-3 py-2">{item.sort_no}</td>
                              <td className="px-3 py-2">
                                {item.food_name ?? `food_id=${item.food_id}`}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {Number(item.grams).toFixed(1)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {item.kcal_per_g == null
                                  ? "－"
                                  : Number(item.kcal_per_g).toFixed(3)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {Number.isFinite(rowKcal) ? rowKcal.toFixed(1) : "－"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t bg-zinc-50 font-medium">
                        <tr>
                          <td className="px-3 py-2" colSpan={2}>
                            合計
                          </td>
                          <td className="px-3 py-2 text-right">
                            {totalGrams.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right"></td>
                          <td className="px-3 py-2 text-right">
                            {totalKcal.toFixed(1)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">
                    作成：{fmtDateTime(setRow.created_at)}
                    <span className="mx-2">/</span>
                    更新：{fmtDateTime(setRow.updated_at)}
                  </div>
                </div>
              );
            })}

            {!loading && mealSets.length === 0 && (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                登録済みセットはまだありません
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}