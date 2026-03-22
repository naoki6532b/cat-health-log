"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Food = {
  id: number;
  food_name: string;
  food_type: string | null;
  kcal_per_g: number;
  package_g: number | null;
  package_kcal: number | null;
  created_at?: string;
  updated_at?: string;
};

function parsePackageLabel(s: string) {
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*g.*?([0-9]+(?:\.[0-9]+)?)\s*kcal/i);
  if (!m) return null;
  return { g: Number(m[1]), kcal: Number(m[2]) };
}

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [msg, setMsg] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [label, setLabel] = useState("");
  const [g, setG] = useState("");
  const [k, setK] = useState("");

  const kcalPerG = useMemo(() => {
    const a = parsePackageLabel(label);
    const gg = a?.g ?? Number(g);
    const kk = a?.kcal ?? Number(k);
    if (!gg || !kk || Number.isNaN(gg) || Number.isNaN(kk)) return null;
    return kk / gg;
  }, [label, g, k]);

  const load = async () => {
    setMsg("");
    const res = await apiFetch("/api/foods");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as Food[];
    setFoods(data ?? []);
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        await load();
      } catch (e: unknown) {
        if (!alive) return;
        setMsg("ERROR: " + String(e instanceof Error ? e.message : e));
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setType("");
    setLabel("");
    setG("");
    setK("");
    setMsg("");
  };

  const startEdit = (food: Food) => {
    setEditingId(food.id);
    setName(food.food_name);
    setType(food.food_type ?? "");
    setLabel("");
    setG(food.package_g == null ? "" : String(food.package_g));
    setK(food.package_kcal == null ? "" : String(food.package_kcal));
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMsg(`「${food.food_name}」を編集モードで読み込みました`);
  };

  const save = async () => {
    setMsg("");

    if (!name.trim()) {
      setMsg("フード名が必要です");
      return;
    }
    if (!kcalPerG) {
      setMsg("カロリー表記（nn g あたり nn kcal）または g/kcal を入力してください");
      return;
    }

    const a = parsePackageLabel(label);
    const payload = {
      food_name: name.trim(),
      food_type: type.trim() || null,
      kcal_per_g: kcalPerG,
      package_g: a?.g ?? (g ? Number(g) : null),
      package_kcal: a?.kcal ?? (k ? Number(k) : null),
    };

    const res = editingId
      ? await apiFetch(`/api/foods/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await apiFetch("/api/foods", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }

    await load();
    const action = editingId ? "更新" : "追加";
    resetForm();
    setMsg(`${action}しました`);
  };

  const del = async (food: Food) => {
    if (!confirm(`「${food.food_name}」を削除しますか？`)) return;

    setMsg("");

    const res = await apiFetch(`/api/foods/${food.id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }

    await load();

    if (editingId === food.id) {
      resetForm();
    }

    setMsg("削除しました");
  };

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">キャットフードDB 管理</h2>
        <div className="mt-1 text-sm text-zinc-600">
          追加・再読み込み・フォーム初期化をボタン操作に統一しています。
        </div>
      </div>

      {msg && (
        <div
          className={
            msg.startsWith("ERROR")
              ? "text-sm text-red-600"
              : "text-sm text-emerald-700"
          }
        >
          {msg}
        </div>
      )}

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{editingId ? "フード編集" : "新規フード追加"}</h3>
          <button type="button" onClick={resetForm} className="btn">
            フォーム初期化
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">フード名</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">種別（任意）</div>
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="ドライ/ウェット/おやつ…"
              className="input"
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-zinc-700">パッケージ表記（そのまま入力OK）</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: 50gあたり180kcal"
              className="input"
            />
            <div className="mt-1 text-xs text-zinc-500">
              ※ 「nn g」「nn kcal」を含む文字なら概ねOK
            </div>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <div className="mb-1 font-medium text-zinc-700">package g（任意）</div>
              <input
                value={g}
                onChange={(e) => setG(e.target.value)}
                placeholder="g"
                className="input"
              />
            </label>

            <label className="block text-sm">
              <div className="mb-1 font-medium text-zinc-700">package kcal（任意）</div>
              <input
                value={k}
                onChange={(e) => setK(e.target.value)}
                placeholder="kcal"
                className="input"
              />
            </label>
          </div>

          <div className="text-sm text-zinc-700">
            1gあたりkcal（自動計算）：
            <span className="ml-2 font-semibold">
              {kcalPerG ? kcalPerG.toFixed(6) : "－"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                save().catch((e: unknown) =>
                  setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                )
              }
              className="rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {editingId ? "更新" : "追加"}
            </button>

            <button
              type="button"
              onClick={() =>
                load().catch((e: unknown) =>
                  setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                )
              }
              className="btn"
            >
              再読み込み
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700">
          登録済みフード
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs leading-tight">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="bg-white text-zinc-700">
                <th className="border-b px-2 py-2 text-left font-semibold">ID</th>
                <th className="border-b px-2 py-2 text-left font-semibold">フード名</th>
                <th className="border-b px-2 py-2 text-left font-semibold">種別</th>
                <th className="border-b px-2 py-2 text-right font-semibold">package g</th>
                <th className="border-b px-2 py-2 text-right font-semibold">package kcal</th>
                <th className="border-b px-2 py-2 text-right font-semibold">1gあたりkcal</th>
                <th className="border-b px-2 py-2 text-center font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {foods.map((f) => (
                <tr key={f.id} className="odd:bg-white even:bg-zinc-50/50">
                  <td className="border-b px-2 py-2 align-middle">{f.id}</td>
                  <td className="border-b px-2 py-2 align-middle whitespace-nowrap">
                    {f.food_name}
                  </td>
                  <td className="border-b px-2 py-2 align-middle whitespace-nowrap">
                    {f.food_type ?? ""}
                  </td>
                  <td className="border-b px-2 py-2 text-right align-middle">
                    {f.package_g ?? ""}
                  </td>
                  <td className="border-b px-2 py-2 text-right align-middle">
                    {f.package_kcal ?? ""}
                  </td>
                  <td className="border-b px-2 py-2 text-right align-middle">
                    {Number(f.kcal_per_g).toFixed(6)}
                  </td>
                  <td className="border-b px-2 py-2 align-middle">
                    <div className="flex flex-wrap justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          del(f).catch((e: unknown) =>
                            setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                          )
                        }
                        className="rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 shadow-sm transition hover:bg-red-100"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {foods.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-500">
                    まだ登録がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}