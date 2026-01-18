"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // もし recent API が返してくれるなら表示に使う（無くても動く）
  leftover_g?: number | null;
  kcal_per_g_snapshot?: number | null;
  net_grams?: number | null;
  net_kcal?: number | null;
};

type GroupMeal = {
  id: number;
  dt: string;
  meal_group_id?: string | null;
  food_id: number;
  food_name?: string | null;
  grams: number;
  kcal: number;
  kcal_per_g_snapshot: number;
  leftover_g: number;
  net_grams?: number;
  net_kcal?: number;
  note?: string | null;
};

function fmtJst(dtIso: string) {
  const d = new Date(dtIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${y}/${m}/${da} ${h}:${mi}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * RecentMeals
 * - 直近の給餌ログ表示
 * - 修正/削除
 * - ★残り入力（フード別g / 全体%）をモーダルで登録
 */
export default function RecentMeals({ limit = 20 }: { limit?: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Meal[]>([]);
  const [msg, setMsg] = useState<string>("");

  // 削除確認モーダル用
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmText, setConfirmText] = useState<string>("");

  // 残り入力モーダル用
  const [leftoverOpen, setLeftoverOpen] = useState(false);
  const [leftoverAnchor, setLeftoverAnchor] = useState<Meal | null>(null);
  const [groupMeals, setGroupMeals] = useState<GroupMeal[]>([]);
  const [leftMode, setLeftMode] = useState<"by_food" | "ratio">("by_food");
  const [ratioPercent, setRatioPercent] = useState<string>(""); // 0-100

  // meal_id -> leftover_g input
  const [leftByFood, setLeftByFood] = useState<Record<string, string>>({});
  const [leftNote, setLeftNote] = useState<string>("");

  const busyRef = useRef<{ del?: number; edit?: number; leftover?: number }>({});

  const reload = useCallback(async () => {
    setMsg("");
    const res = await apiFetch(
      `/api/meals/recent?limit=${encodeURIComponent(String(limit))}`,
      { cache: "no-store" }
    );
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
    if (busyRef.current.edit === id) return;
    busyRef.current.edit = id;
    router.push(`/meals/${id}`);
    window.setTimeout(() => {
      if (busyRef.current.edit === id) busyRef.current.edit = undefined;
    }, 500);
  };

  // 削除確認（スマホで confirm が出ない対策）
  const askDelete = (m: Meal) => {
    setMsg("");
    setConfirmId(m.id);
    const label = `${fmtJst(m.dt)} / ${m.food_name ?? "（不明）"} / g:${m.grams ?? "－"} kcal:${m.kcal ?? "－"}`;
    setConfirmText(label);
  };

  const doDelete = async (id: number) => {
    if (busyRef.current.del === id) return;
    busyRef.current.del = id;

    try {
      setMsg("");
      const res = await apiFetch(`/api/meals/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      setMsg("削除しました");
      setConfirmId(null);
      setConfirmText("");
      await reload();
    } finally {
      window.setTimeout(() => {
        if (busyRef.current.del === id) busyRef.current.del = undefined;
      }, 800);
    }
  };

  // ===== 残り入力モーダル関連 =====

  const closeLeftover = () => {
    setLeftoverOpen(false);
    setLeftoverAnchor(null);
    setGroupMeals([]);
    setLeftMode("by_food");
    setRatioPercent("");
    setLeftByFood({});
    setLeftNote("");
  };

  const openLeftover = async (anchor: Meal) => {
    if (busyRef.current.leftover === anchor.id) return;
    busyRef.current.leftover = anchor.id;

    try {
      setMsg("");
      setLeftoverAnchor(anchor);
      setLeftoverOpen(true);
      setLeftMode("by_food");
      setRatioPercent("");
      setLeftNote("");

      // グループの詳細を取る（anchor_id から meal_group_id を辿る）
      // もし group API を作ってない場合は、leftoverモーダル内でフード別入力ができないので必須
      const res = await apiFetch(`/api/meals/group?anchor_id=${encodeURIComponent(String(anchor.id))}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GroupMeal[];
      const list = Array.isArray(data) ? data : [];
      setGroupMeals(list);

      // 初期値：現在の leftover_g を入力欄にセット
      const init: Record<string, string> = {};
      for (const r of list) {
        init[String(r.id)] = String(r.leftover_g ?? 0);
      }
      setLeftByFood(init);
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e));
      // 開けないなら閉じる
      closeLeftover();
    } finally {
      window.setTimeout(() => {
        if (busyRef.current.leftover === anchor.id) busyRef.current.leftover = undefined;
      }, 600);
    }
  };

  const totalPlaced = useMemo(() => {
    return groupMeals.reduce((acc, r) => acc + n(r.grams, 0), 0);
  }, [groupMeals]);

  const totalLeftoverInput = useMemo(() => {
    return groupMeals.reduce((acc, r) => {
      const s = leftByFood[String(r.id)];
      const v = s == null || s === "" ? 0 : n(s, 0);
      return acc + v;
    }, 0);
  }, [groupMeals, leftByFood]);

  const totalNet = useMemo(() => {
    // net = placed - leftover
    return Math.max(0, totalPlaced - totalLeftoverInput);
  }, [totalPlaced, totalLeftoverInput]);

  const onApplyRatioToInputs = () => {
    const pct = clamp(n(ratioPercent, 0), 0, 100);
    const frac = pct / 100;

    const next: Record<string, string> = { ...leftByFood };
    for (const r of groupMeals) {
      const lv = Number((n(r.grams, 0) * frac).toFixed(3));
      next[String(r.id)] = String(clamp(lv, 0, n(r.grams, 0)));
    }
    setLeftByFood(next);
  };

  const submitLeftover = async () => {
    if (!leftoverAnchor) return;

    setMsg("");

    if (leftMode === "ratio") {
      const pct = n(ratioPercent, NaN);
      if (!Number.isFinite(pct)) {
        setMsg("ERROR: 残り割合(%) を入力してください");
        return;
      }
      const pctClamped = clamp(pct, 0, 100);

      const res = await apiFetch("/api/meals/leftover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "ratio",
          anchor_id: leftoverAnchor.id,
          ratio_percent: pctClamped,
          note: leftNote || null,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        setMsg("ERROR: " + (t || `HTTP ${res.status}`));
        return;
      }

      setMsg("残りを登録しました");
      closeLeftover();
      await reload();
      return;
    }

    // by_food
    const itemsPayload = groupMeals.map((r) => {
      const s = leftByFood[String(r.id)];
      const v = s == null || s === "" ? 0 : n(s, 0);
      const lv = clamp(v, 0, n(r.grams, 0));
      return { meal_id: r.id, leftover_g: lv };
    });

    const res = await apiFetch("/api/meals/leftover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "by_food",
        anchor_id: leftoverAnchor.id,
        items: itemsPayload,
        note: leftNote || null,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      setMsg("ERROR: " + (t || `HTTP ${res.status}`));
      return;
    }

    setMsg("残りを登録しました");
    closeLeftover();
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">直近の給餌ログ</h2>
          <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-600">
            修正/削除/残り
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50 active:scale-[0.99]"
            onClick={() =>
              reload().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))
            }
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
                    置いたg: {m.grams ?? "－"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                    置いたkcal: {m.kcal ?? "－"}
                  </span>

                  {m.leftover_g != null ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      残りg: {m.leftover_g}
                    </span>
                  ) : null}

                  {m.net_kcal != null ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      実食kcal: {m.net_kcal}
                    </span>
                  ) : null}

                  {m.note ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      note: {m.note}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* ボタン */}
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  className="relative z-10 touch-manipulation select-none rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(m.id);
                  }}
                >
                  修正
                </button>

                <button
                  type="button"
                  className="relative z-10 touch-manipulation select-none rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 active:scale-[0.99]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openLeftover(m).catch((err) =>
                      setMsg("ERROR: " + String(err?.message ?? err))
                    );
                  }}
                >
                  残り
                </button>

                <button
                  type="button"
                  className="relative z-10 touch-manipulation select-none rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-500 active:scale-[0.99]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    askDelete(m);
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

      {/* 削除確認モーダル（スマホでも確実に動く） */}
      {confirmId != null ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setConfirmId(null);
            setConfirmText("");
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold">削除しますか？</div>
            <div className="mt-2 text-sm text-zinc-600 break-words">
              {confirmText}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                onClick={() => {
                  setConfirmId(null);
                  setConfirmText("");
                }}
              >
                キャンセル
              </button>

              <button
                type="button"
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                onClick={() => {
                  doDelete(confirmId).catch((err) =>
                    setMsg("ERROR: " + String(err?.message ?? err))
                  );
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 残り入力モーダル */}
      {leftoverOpen && leftoverAnchor ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={closeLeftover}
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">残り入力</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {fmtJst(leftoverAnchor.dt)}（この15分グループ全体に反映）
                </div>
              </div>

              <button
                type="button"
                className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                onClick={closeLeftover}
              >
                閉じる
              </button>
            </div>

            <div className="mt-4 rounded-2xl border bg-zinc-50 p-3 text-sm text-zinc-700">
              <div className="flex flex-wrap gap-3">
                <div>合計 置いた: <b>{totalPlaced.toFixed(1)} g</b></div>
                <div>合計 残り入力: <b>{totalLeftoverInput.toFixed(1)} g</b></div>
                <div>合計 実食: <b>{totalNet.toFixed(1)} g</b></div>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                ※DB制約により「残りg」は各行の「置いたg」を超えないよう自動で丸めます
              </div>
            </div>

            {/* モード切替 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={
                  "rounded-2xl border px-3 py-2 text-sm " +
                  (leftMode === "by_food"
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white hover:bg-zinc-50")
                }
                onClick={() => setLeftMode("by_food")}
              >
                フード別に入力（g）
              </button>

              <button
                type="button"
                className={
                  "rounded-2xl border px-3 py-2 text-sm " +
                  (leftMode === "ratio"
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white hover:bg-zinc-50")
                }
                onClick={() => setLeftMode("ratio")}
              >
                全体の残割合（%）
              </button>
            </div>

            {/* ratio */}
            {leftMode === "ratio" ? (
              <div className="mt-4 rounded-3xl border bg-white p-4">
                <div className="text-sm font-medium">残り割合（%）</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={ratioPercent}
                    onChange={(e) => setRatioPercent(e.target.value)}
                    inputMode="decimal"
                    className="w-28 rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="例: 30"
                  />
                  <span className="text-sm text-zinc-600">%</span>

                  <button
                    type="button"
                    className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                    onClick={onApplyRatioToInputs}
                  >
                    この%をフード別入力に反映
                  </button>
                </div>

                <div className="mt-2 text-xs text-zinc-500">
                  ※「保存」は割合で保存できます。反映ボタンは、フード別入力欄にも同じ割合を自動入力するための補助です。
                </div>
              </div>
            ) : null}

            {/* by_food */}
            <div className="mt-4 rounded-3xl border bg-white p-4">
              <div className="text-sm font-medium">フード別の残り（g）</div>

              <div className="mt-3 space-y-2">
                {groupMeals.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {r.food_name ?? `food_id:${r.food_id}`}
                      </div>
                      <div className="text-xs text-zinc-500">
                        置いた: {n(r.grams, 0).toFixed(1)}g / kcal: {n(r.kcal, 0).toFixed(1)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        value={leftByFood[String(r.id)] ?? "0"}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLeftByFood((prev) => ({ ...prev, [String(r.id)]: v }));
                        }}
                        inputMode="decimal"
                        className="w-28 rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                      />
                      <span className="text-sm text-zinc-600">g</span>

                      <button
                        type="button"
                        className="rounded-2xl border bg-white px-3 py-2 text-xs hover:bg-zinc-50"
                        onClick={() => {
                          // 全残し（=置いたg）
                          const v = n(r.grams, 0);
                          setLeftByFood((prev) => ({ ...prev, [String(r.id)]: String(v) }));
                        }}
                      >
                        全残し
                      </button>

                      <button
                        type="button"
                        className="rounded-2xl border bg-white px-3 py-2 text-xs hover:bg-zinc-50"
                        onClick={() => {
                          // 0
                          setLeftByFood((prev) => ({ ...prev, [String(r.id)]: "0" }));
                        }}
                      >
                        0
                      </button>
                    </div>
                  </div>
                ))}

                {groupMeals.length === 0 ? (
                  <div className="text-sm text-zinc-500">
                    グループ取得に失敗しました（/api/meals/group が必要です）
                  </div>
                ) : null}
              </div>
            </div>

            {/* note */}
            <div className="mt-4">
              <div className="text-sm font-medium">メモ（任意）</div>
              <textarea
                value={leftNote}
                onChange={(e) => setLeftNote(e.target.value)}
                className="mt-2 w-full rounded-3xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                rows={3}
                placeholder="例：30分後に廃棄 / 少し残した など"
              />
            </div>

            {/* actions */}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-2xl border bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                onClick={closeLeftover}
              >
                キャンセル
              </button>

              <button
                type="button"
                className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                onClick={() => submitLeftover().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}
              >
                保存
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              ※あなたの指定どおり、残りの dt は給餌イベントの開始時刻（このグループ）と同一で更新されます
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
