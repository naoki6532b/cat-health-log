"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Food = {
  id: number;
  food_name: string;
  food_type: string | null;
  kcal_per_g: number;
};

// 例: "50gあたり180kcal" / "50 g 180 kcal" みたいな表記から抽出
function parsePackageLabel(s: string) {
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*g.*?([0-9]+(?:\.[0-9]+)?)\s*kcal/i);
  if (!m) return null;
  return { g: Number(m[1]), kcal: Number(m[2]) };
}

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [label, setLabel] = useState(""); // 例: 50gあたり180kcal
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
    const data = (await res.json()) as Food[];
    setFoods(data);
  };

  useEffect(() => {
    load().catch((e) => setMsg(String(e?.message ?? e)));
  }, []);

  const add = async () => {
    setMsg("");
    if (!name.trim()) return setMsg("フード名が必要です");
    if (!kcalPerG) return setMsg("カロリー表記（nn g あたり nn kcal）を入力してください");

    const a = parsePackageLabel(label);

    await apiFetch("/api/foods", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        food_name: name.trim(),
        food_type: type.trim() || null,
        kcal_per_g: kcalPerG,
        package_g: a?.g ?? (g ? Number(g) : null),
        package_kcal: a?.kcal ?? (k ? Number(k) : null),
      }),
    });

    setName("");
    setType("");
    setLabel("");
    setG("");
    setK("");
    await load();
    setMsg("追加しました");
  };

  const del = async (id: number) => {
    if (!confirm("削除しますか？")) return;
    setMsg("");
    await apiFetch(`/api/foods/${id}`, { method: "DELETE" });
    await load();
    setMsg("削除しました");
  };

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h2>キャットフードDB 管理</h2>
      {msg && <div style={{ color: msg.startsWith("ERROR") ? "red" : "green" }}>{msg}</div>}

      <section style={{ border: "1px solid #ccc", padding: 12, borderRadius: 8 }}>
        <div style={{ marginBottom: 8 }}>
          <div>フード名</div>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>種別（任意）</div>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="ドライ/ウェット/おやつ…"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>パッケージ表記（そのまま入力OK）</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例: 50gあたり180kcal"
            style={{ width: "100%" }}
          />
          <small>※「nn g」「nn kcal」を含む文字なら概ねOK</small>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>数値で入れる場合（任意）</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={g} onChange={(e) => setG(e.target.value)} placeholder="g" style={{ flex: 1 }} />
            <input value={k} onChange={(e) => setK(e.target.value)} placeholder="kcal" style={{ flex: 1 }} />
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          1gあたりkcal（自動計算）：<b>{kcalPerG ? kcalPerG.toFixed(6) : "－"}</b>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => add().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>追加</button>
          <button onClick={() => load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>再読込</button>
        </div>
      </section>

      <h3 style={{ marginTop: 16 }}>登録済みフード</h3>
      <table border={1} cellPadding={6} style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>フード名</th>
            <th>種別</th>
            <th>1gあたりkcal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {foods.map((f) => (
            <tr key={f.id}>
              <td>{f.id}</td>
              <td>{f.food_name}</td>
              <td>{f.food_type ?? ""}</td>
              <td>{Number(f.kcal_per_g).toFixed(6)}</td>
              <td>
                <button onClick={() => del(f.id).catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>
                  削除
                </button>
              </td>
            </tr>
          ))}
          {foods.length === 0 && (
            <tr>
              <td colSpan={5}>まだ登録がありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}