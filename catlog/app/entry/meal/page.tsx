"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Food = { id: number; food_name: string; kcal_per_g: number };

function toDatetimeLocal(d: Date) {
  const pad = (n:number)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MealEntry() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodId, setFoodId] = useState<number | null>(null);
  const [dtLocal, setDtLocal] = useState(toDatetimeLocal(new Date()));
  const [grams, setGrams] = useState("");
  const [kcal, setKcal] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const lock = useRef<"g"|"k"|null>(null);

  const loadFoods = async () => {
    setMsg("");
    const res = await apiFetch("/api/foods");
    const data = await res.json();
    setFoods(data);
    if (data.length) setFoodId(data[0].id);
  };

  useEffect(() => { loadFoods().catch(e => setMsg(String(e.message ?? e))); }, []);

  const selected = useMemo(
    () => foods.find(f => f.id === foodId) ?? null,
    [foods, foodId]
  );

  // g入力 → kcal自動
  useEffect(() => {
    if (!selected) return;
    if (lock.current === "k") return;
    lock.current = "g";

    const g = Number(grams);
    if (!grams || Number.isNaN(g)) { setKcal(""); lock.current=null; return; }
    setKcal((g * Number(selected.kcal_per_g)).toFixed(1));
    lock.current = null;
  }, [grams, selected]);

  // kcal入力 → g自動
  useEffect(() => {
    if (!selected) return;
    if (lock.current === "g") return;
    lock.current = "k";

    const k = Number(kcal);
    if (!kcal || Number.isNaN(k)) { setGrams(""); lock.current=null; return; }
    setGrams((k / Number(selected.kcal_per_g)).toFixed(1));
    lock.current = null;
  }, [kcal, selected]);

  const save = async () => {
    setMsg("");
    if (!selected || !foodId) return setMsg("フードが未登録です（先に/foodsで追加）");

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
        note,
      }),
    });

    setMsg("保存しました");
    setNote("");
  };

  return (
    <main style={{ padding: 16, maxWidth: 650 }}>
      <h2>給餌入力</h2>
      <div style={{ color: "red" }}>{msg}</div>

      <div>
        <div>日時（デフォルト現在・修正可）</div>
        <input type="datetime-local" value={dtLocal} onChange={e=>setDtLocal(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        <div>フード（ドロップダウン）</div>
        <select value={foodId ?? ""} onChange={e=>setFoodId(Number(e.target.value))} style={{ width: "100%" }}>
          {foods.map(f => <option key={f.id} value={f.id}>{f.food_name}</option>)}
        </select>
        {selected && <small>1gあたり {Number(selected.kcal_per_g).toFixed(3)} kcal</small>}
      </div>

      <div style={{ marginTop: 10 }}>
        <div>グラム(g) / カロリー(kcal)（どちらでも入力OK → 自動計算）</div>
        <div style={{ display:"flex", gap:8 }}>
          <input type="number" value={grams} onChange={e=>setGrams(e.target.value)} placeholder="g" style={{ flex:1 }} />
          <input type="number" value={kcal}  onChange={e=>setKcal(e.target.value)}  placeholder="kcal" style={{ flex:1 }} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>メモ</div>
        <textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} style={{ width:"100%" }} />
      </div>

      <div style={{ marginTop: 12, display:"flex", gap:8 }}>
        <button onClick={() => save().catch(e => setMsg(String(e.message ?? e)))}>保存</button>
        <button onClick={() => loadFoods().catch(e => setMsg(String(e.message ?? e)))}>フード再読込</button>
      </div>
    </main>
  );
}