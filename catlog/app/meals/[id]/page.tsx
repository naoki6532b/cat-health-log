"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Food = {
  id: any;
  food_name: string;
  kcal_per_g: number;
};

type Meal = {
  id: number;
  dt: string; // ISO
  food_id: any;
  grams: number | null;
  kcal: number | null;
  note: string | null;
  kcal_per_g_snapshot?: number | null;
  leftover_g?: number | null;
  meal_group_id?: string | null;
};

type GroupRow = {
  id: number;
  food_id: number;
  food_name: string | null;
  grams: number | null;
  kcal: number | null;
  kcal_per_g_snapshot: number | null;
};

type GroupEditRow = {
  id: number;
  food_id: number;
  food_name: string | null;
  kcal_per_g_snapshot: number;
  grams: string;
  kcal: string;
};

function toDatetimeLocalFromISO(iso: string) {
  // ISO(UTC) -> datetime-local(ローカル)へ
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function mustJsonOrText(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await res.json().catch(() => null);
    return j ?? {};
  }
  const t = await res.text().catch(() => "");
  return t;
}

async function ensureOk(res: Response) {
  if (res.ok) return;
  const body = await mustJsonOrText(res);
  const msg =
    typeof body === "string"
      ? body
      : (body?.error as string) || JSON.stringify(body);
  throw new Error(msg || `${res.status} ${res.statusText}`);
}

export default function MealEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [foods, setFoods] = useState<Food[]>([]);
  const [meal, setMeal] = useState<Meal | null>(null);

  const [msg, setMsg] = useState("");

  const [dtLocal, setDtLocal] = useState(toDatetimeLocal(new Date()));
  const [foodId, setFoodId] = useState<any>("");
  const [grams, setGrams] = useState<string>("");
  const [kcal, setKcal] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [lastEdited, setLastEdited] = useState<"g" | "k" | null>(null);

  // セット（同一 meal_group_id）の修正用。2件以上ならセットモード。
  const [groupRows, setGroupRows] = useState<GroupEditRow[]>([]);
  const isGroup = groupRows.length > 1;

  const selected = useMemo(() => {
    return foods.find((f) => String(f.id) === String(foodId)) ?? null;
  }, [foods, foodId]);

  // g -> kcal 自動（単品モード）
  useEffect(() => {
    if (isGroup) return;
    if (!selected) return;
    if (lastEdited !== "g") return;
    const g = Number(grams);
    if (!g || Number.isNaN(g)) return;
    const k = g * Number(selected.kcal_per_g);
    setKcal(k.toFixed(1));
  }, [grams, selected, lastEdited, isGroup]);

  // kcal -> g 自動（単品モード）
  useEffect(() => {
    if (isGroup) return;
    if (!selected) return;
    if (lastEdited !== "k") return;
    const k = Number(kcal);
    if (!k || Number.isNaN(k) || Number(selected.kcal_per_g) === 0) return;
    const g = k / Number(selected.kcal_per_g);
    setGrams(g.toFixed(1));
  }, [kcal, selected, lastEdited, isGroup]);

  const groupTotal = useMemo(() => {
    let g = 0;
    let k = 0;
    for (const r of groupRows) {
      const gv = Number(r.grams);
      if (Number.isFinite(gv)) g += gv;
      const kv = Number(r.kcal);
      if (Number.isFinite(kv)) k += kv;
    }
    return { grams: g, kcal: k };
  }, [groupRows]);

  const loadFoods = async () => {
    const res = await apiFetch("/api/foods");
    await ensureOk(res);
    const data = (await res.json()) as Food[];
    setFoods(data ?? []);
    return data ?? [];
  };

  const loadGroup = async (anchorId: number) => {
    const res = await apiFetch(`/api/meals/group?anchor_id=${anchorId}`);
    if (!res.ok) {
      // グループ取得に失敗したら単品モードにフォールバック
      setGroupRows([]);
      return;
    }
    const rows = (await res.json()) as GroupRow[];
    if (!Array.isArray(rows) || rows.length <= 1) {
      setGroupRows([]);
      return;
    }
    setGroupRows(
      rows.map((r) => ({
        id: r.id,
        food_id: r.food_id,
        food_name: r.food_name,
        kcal_per_g_snapshot: Number(r.kcal_per_g_snapshot ?? 0),
        grams: r.grams == null ? "" : String(r.grams),
        kcal: r.kcal == null ? "" : String(r.kcal),
      }))
    );
  };

  const loadMeal = async () => {
    if (!id) throw new Error("id が不明です");
    const res = await apiFetch(`/api/meals/${id}`);
    await ensureOk(res);
    const data = (await res.json()) as Meal;
    setMeal(data);

    setDtLocal(toDatetimeLocalFromISO(data.dt));
    setFoodId(data.food_id ?? "");
    setGrams(data.grams == null ? "" : String(data.grams));
    setKcal(data.kcal == null ? "" : String(data.kcal));
    setNote(data.note ?? "");
    setLastEdited(null);

    if (data.meal_group_id) {
      await loadGroup(data.id);
    } else {
      setGroupRows([]);
    }

    return data;
  };

  useEffect(() => {
    (async () => {
      setMsg("");
      try {
        await loadFoods();
        await loadMeal();
      } catch (e: any) {
        setMsg("ERROR: " + String(e?.message ?? e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // セットモード：grams 変更 → snapshot から kcal 再計算
  const onChangeRowGrams = (rowId: number, v: string) => {
    setGroupRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (v === "") return { ...r, grams: "", kcal: "" };
        const g = Number(v);
        const snap = Number(r.kcal_per_g_snapshot);
        const kcalNext =
          Number.isFinite(g) && Number.isFinite(snap) && snap > 0
            ? (g * snap).toFixed(1)
            : r.kcal;
        return { ...r, grams: v, kcal: kcalNext };
      })
    );
  };

  const onChangeRowFood = (rowId: number, nextFoodId: string) => {
    const nextFood = foods.find((food) => String(food.id) === nextFoodId);
    if (!nextFood) return;

    setGroupRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const gramsValue = Number(row.grams);
        const nextSnapshot = Number(nextFood.kcal_per_g);
        const nextKcal =
          Number.isFinite(gramsValue) &&
          Number.isFinite(nextSnapshot) &&
          nextSnapshot > 0
            ? (gramsValue * nextSnapshot).toFixed(1)
            : row.kcal;

        return {
          ...row,
          food_id: Number(nextFood.id),
          food_name: nextFood.food_name,
          kcal_per_g_snapshot: nextSnapshot,
          kcal: nextKcal,
        };
      })
    );
  };

  // セットモード：kcal 変更 → snapshot から grams 再計算
  const onChangeRowKcal = (rowId: number, v: string) => {
    setGroupRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (v === "") return { ...r, kcal: "", grams: "" };
        const k = Number(v);
        const snap = Number(r.kcal_per_g_snapshot);
        const gramsNext =
          Number.isFinite(k) && Number.isFinite(snap) && snap > 0
            ? (k / snap).toFixed(1)
            : r.grams;
        return { ...r, kcal: v, grams: gramsNext };
      })
    );
  };

  const saveGroup = async () => {
    setMsg("");
    try {
      if (!id) throw new Error("id が不明です");

      const items = groupRows.map((r) => {
        const g = Number(r.grams);
        if (!g || Number.isNaN(g) || g <= 0) {
          throw new Error(
            `「${r.food_name ?? `food_id:${r.food_id}`}」のグラム数を入力してください`
          );
        }
        const k = Number(r.kcal);
        return {
          meal_id: r.id,
          food_id: r.food_id,
          grams: g,
          kcal: Number.isFinite(k) && k > 0 ? k : null,
        };
      });

      const res = await apiFetch(`/api/meals/group`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          anchor_id: Number(id),
          dt: new Date(dtLocal).toISOString(),
          items,
        }),
      });

      await ensureOk(res);

      setMsg("セットのフードと給餌量を保存しました");
      await loadMeal();
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e));
    }
  };

  const save = async () => {
    setMsg("");
    try {
      if (!id) throw new Error("id が不明です");
      if (foodId === "" || foodId == null) throw new Error("フードを選択してください");

      const g = Number(grams);
      const k = Number(kcal);

      if (!g || Number.isNaN(g)) throw new Error("グラム数を入力してください");
      if (!k || Number.isNaN(k)) throw new Error("カロリーが不正です");

      const res = await apiFetch(`/api/meals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dt: new Date(dtLocal).toISOString(),
          food_id: foodId,
          grams: g,
          kcal: k,
          note: note || null,
        }),
      });

      await ensureOk(res);

      setMsg("保存しました");
      await loadMeal(); // ← 保存後に再読込（画面上のズレ防止）
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e));
    }
  };

  const del = async () => {
    setMsg("");
    try {
      if (!id) throw new Error("id が不明です");
      const res = await apiFetch(`/api/meals/${id}`, { method: "DELETE" });
      await ensureOk(res);
      setMsg("削除しました");
      router.push("/entry/meal");
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">給餌 修正</h1>
          <p className="text-sm text-zinc-500">
            {isGroup
              ? "セットで登録された給餌です。フードと量をまとめて修正できます"
              : "保存に失敗した場合は原因を表示します"}
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={
            "rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap break-words " +
            (msg.startsWith("ERROR") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")
          }
        >
          {msg}
        </div>
      )}

      {isGroup ? (
        // ===== セット修正モード =====
        <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium">日時（セット全体）</div>
              <input
                type="datetime-local"
                value={dtLocal}
                onChange={(e) => setDtLocal(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
              <div className="mt-1 text-xs text-zinc-500">
                変更するとセット内の全フードの日時が揃います
              </div>
            </label>

            <div className="block">
              <div className="mb-1 text-sm font-medium">セット合計</div>
              <div className="rounded-2xl border bg-zinc-50 px-3 py-2 text-sm">
                {groupTotal.grams.toFixed(1)} g / {groupTotal.kcal.toFixed(1)} kcal
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-medium">フード別の給餌内容</div>

            <div className="space-y-2">
              {groupRows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border bg-white px-3 py-3"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-500">フード</div>
                      <select
                        value={String(r.food_id)}
                        onChange={(e) => onChangeRowFood(r.id, e.target.value)}
                        className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                      >
                        {foods.map((food) => (
                          <option key={String(food.id)} value={String(food.id)}>
                            {food.food_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-500">グラム (g)</div>
                      <input
                        value={r.grams}
                        onChange={(e) => onChangeRowGrams(r.id, e.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-500">
                        カロリー (kcal)（自動計算）
                      </div>
                      <input
                        value={r.kcal}
                        onChange={(e) => onChangeRowKcal(r.id, e.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-xs text-zinc-500">
              ※ フード変更時とg入力時は、選択中フードの1gあたりkcalで自動計算します。
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={saveGroup}
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:scale-[0.99]"
            >
              セットを保存
            </button>

            <Link
              href="/entry/meal"
              className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99]"
            >
              戻る
            </Link>

            <button
              onClick={del}
              className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 active:scale-[0.99] sm:ml-auto"
            >
              このフード行を削除
            </button>
          </div>
        </div>
      ) : (
        // ===== 単品修正モード =====
        <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium">日時</div>
              <input
                type="datetime-local"
                value={dtLocal}
                onChange={(e) => setDtLocal(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-sm font-medium">フード名</div>
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
              <div className="mt-1 text-xs text-zinc-500">1gあたりkcal：{selected ? Number(selected.kcal_per_g).toFixed(6) : "－"}</div>
            </label>
          </div>

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
                <div className="mb-1 text-xs text-zinc-500">カロリー (kcal)（自動計算）</div>
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
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-medium">メモ</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              rows={3}
            />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={save}
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:scale-[0.99]"
            >
              保存
            </button>

            <Link
              href="/entry/meal"
              className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99]"
            >
              戻る
            </Link>

            <button
              onClick={del}
              className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 active:scale-[0.99] sm:ml-auto"
            >
              削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
