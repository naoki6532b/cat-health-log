"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Food = { id: number; food_name: string; kcal_per_g: number };
type Meal = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
};

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(v: string) {
  return new Date(v).toISOString();
}

export default function MealEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const idStr = params.id;

  const [foods, setFoods] = useState<Food[]>([]);
  const [row, setRow] = useState<Meal | null>(null);
  const [msg, setMsg] = useState("");

  const selectedFood = useMemo(() => {
    if (!row?.food_id) return null;
    return foods.find((f) => f.id === row.food_id) ?? null;
  }, [foods, row?.food_id]);

  const load = async () => {
    setMsg("");

    // foods
    const fRes = await apiFetch("/api/foods");
    if (!fRes.ok) {
      setMsg("ERROR: " + (await fRes.text()));
      return;
    }
    const fData = (await fRes.json()) as Food[];
    setFoods(fData ?? []);

    // meal
    const mRes = await apiFetch(`/api/meals/${idStr}`);
    if (!mRes.ok) {
      setMsg("ERROR: " + (await mRes.text()));
      return;
    }
    const mData = (await mRes.json()) as Meal;
    setRow(mData);
  };

  useEffect(() => {
    load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idStr]);

  // kcal自動計算：food kcal_per_g を使う
  useEffect(() => {
    if (!row) return;
    if (!selectedFood) return;
    if (row.grams == null) return;

    const g = Number(row.grams);
    if (!g || Number.isNaN(g)) return;

    const k = g * Number(selectedFood.kcal_per_g);
    // 小数1桁に丸め
    const kcal = Math.round(k * 10) / 10;

    // 既に同じなら更新しない（無限ループ回避）
    if (row.kcal === kcal) return;

    setRow({ ...row, kcal });
  }, [row?.grams, selectedFood?.kcal_per_g]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!row) return;
    setMsg("");

    if (!row.food_id) return setMsg("フードを選択してください");
    const g = Number(row.grams);
    const k = Number(row.kcal);
    if (!g || Number.isNaN(g)) return setMsg("グラム数を入力してください");
    if (!k || Number.isNaN(k)) return setMsg("カロリーが不正です");

    const res = await apiFetch(`/api/meals/${idStr}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dt: row.dt,
        food_id: row.food_id,
        grams: g,
        kcal: k,
        note: row.note,
      }),
    });

    if (!res.ok) {
      setMsg("ERROR: " + (await res.text()));
      return;
    }

    setMsg("保存しました");
  };

  const remove = async () => {
    if (!confirm("この給餌ログを削除しますか？")) return;
    setMsg("");

    const res = await apiFetch(`/api/meals/${idStr}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg("ERROR: " + (await res.text()));
      return;
    }
    router.push("/entry/meal"); // 給餌入力へ戻す
  };

  if (!row) return <main style={{ padding: 16, maxWidth: 650 }}>{msg || "読み込み中…"}</main>;

  return (
    <main style={{ padding: 16, maxWidth: 650 }}>
      <h2>給餌 修正</h2>
      {msg && <div style={{ color: msg.startsWith("ERROR") ? "red" : "green" }}>{msg}</div>}

      <div style={{ marginTop: 12 }}>
        <div>日時</div>
        <input
          type="datetime-local"
          value={toDatetimeLocal(row.dt)}
          onChange={(e) => setRow({ ...row, dt: fromDatetimeLocal(e.target.value) })}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <div>フード名</div>
        <select
          value={row.food_id ?? ""}
          onChange={(e) => setRow({ ...row, food_id: e.target.value ? Number(e.target.value) : null })}
          style={{ width: "100%" }}
        >
          <option value="">（未選択）</option>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.food_name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 6, color: "#555" }}>
          1gあたりkcal：{selectedFood ? Number(selectedFood.kcal_per_g).toFixed(6) : "－"}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>量</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div>グラム (g)</div>
            <input
              value={row.grams ?? ""}
              onChange={(e) => setRow({ ...row, grams: e.target.value === "" ? null : Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div>カロリー (kcal)（自動計算）</div>
            <input value={row.kcal ?? ""} disabled style={{ width: "100%" }} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>メモ</div>
        <textarea
          value={row.note ?? ""}
          onChange={(e) => setRow({ ...row, note: e.target.value || null })}
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <button onClick={() => save().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>保存</button>
        <button onClick={() => router.push("/entry/meal")}>戻る</button>
        <button onClick={() => remove().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))} style={{ marginLeft: "auto" }}>
          削除
        </button>
      </div>
    </main>
  );
}
