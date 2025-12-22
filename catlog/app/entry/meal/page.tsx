"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Food = {
  id: number;
  food_name: string;
  kcal_per_g: number;
};

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MealEntryPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [msg, setMsg] = useState("");

  const [dtLocal, setDtLocal] = useState(toDatetimeLocal(new Date()));
  const [foodId, setFoodId] = useState<number | "">("");
  const [grams, setGrams] = useState<string>("");
  const [kcal, setKcal] = useState<string>("");

  const selected = useMemo(() => foods.find((f) => f.id === foodId) ?? null, [foods, foodId]);

  // g入力 → kcal自動
  useEffect(() => {
    if (!selected) return;
    const g = Number(grams);
    if (!g || Number.isNaN(g)) return;
    const k = g * selected.kcal_per_g;
    setKcal(k.toFixed(1));
  }, [grams, selected]);

  // kcal入力 → g自動
  useEffect(() => {
    if (!selected) return;
    const k = Number(kcal);
    if (!k || Number.isNaN(k) || selected.kcal_per_g === 0) return;
    const g = k / selected.kcal_per_g;
    setGrams(g.toFixed(1));
  }, [kcal, selected]);

  const loadFoods = async () => {
    setMsg("");
    const res = await apiFetch("/api/foods");
    const data = (await res.json()) as Food[];
    setFoods(data);
    // 既に選択が無ければ先頭を選ぶ
    if (data.length > 0 && foodId === "") setFoodId(data[0].id);
  };

  useEffect(() => {
    loadFoods().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setMsg("");
    if (!foodId) return setMsg("フードを選択してください");
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
  };

  return (
    <main style={{ padding: 16, maxWidth: 650 }}>
      <h2>給餌入力</h2>
      {msg && <div style={{ color: msg.startsWith("ERROR") ? "red" : "green" }}>{msg}</div>}

      <div>
        <div>日時（デフォルト現在・修正可）</div>
        <input type="datetime-local" value={dtLocal} onChange={(e) => setDtLocal(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        <div>フード名</div>
        <select
          value={foodId === "" ? "" : String(foodId)}
          onChange={(e) => setFoodId(e.target.value ? Number(e.target.value) : "")}
          style={{ width: "100%" }}
        >
          {foods.map((f) => (
            <option key={f.id} value={String(f.id)}>
              {f.food_name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 6, color: "#555" }}>
          1gあたりkcal：{selected ? selected.kcal_per_g.toFixed(6) : "－"}
        </div>
        <button style={{ marginTop: 8 }} onClick={() => loadFoods().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>
          フード一覧を再読込
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>量</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div>グラム (g)</div>
            <input value={grams} onChange={(e) => setGrams(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div>カロリー (kcal)</div>
            <input value={kcal} onChange={(e) => setKcal(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>
        <small>※ g入力でkcal自動、kcal入力でg自動（フード選択が必要）</small>
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={() => save().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>保存</button>
      </div>
    </main>
  );
}