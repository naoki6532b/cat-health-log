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
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <h2>キャットフードDB 管理</h2>

      {msg && (
        <div style={{ color: msg.startsWith("ERROR") ? "red" : "green", marginBottom: 12 }}>
          {msg}
        </div>
      )}

      <section
        style={{
          border: "1px solid #ccc",
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{editingId ? "フード編集" : "新規フード追加"}</h3>
          <button onClick={resetForm}>フォーム初期化</button>
        </div>

        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <div>フード名</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%" }}
          />
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
          <small>※ 「nn g」「nn kcal」を含む文字なら概ねOK</small>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>数値で入れる場合（任意）</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={g}
              onChange={(e) => setG(e.target.value)}
              placeholder="g"
              style={{ flex: 1 }}
            />
            <input
              value={k}
              onChange={(e) => setK(e.target.value)}
              placeholder="kcal"
              style={{ flex: 1 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          1gあたりkcal（自動計算）：<b>{kcalPerG ? kcalPerG.toFixed(6) : "－"}</b>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() =>
              save().catch((e: unknown) =>
                setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
              )
            }
          >
            {editingId ? "更新" : "追加"}
          </button>

          <button
            onClick={() =>
              load().catch((e: unknown) =>
                setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
              )
            }
          >
            再読込
          </button>
        </div>
      </section>

      <h3>登録済みフード</h3>

      <table border={1} cellPadding={6} style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>フード名</th>
            <th>種別</th>
            <th>package g</th>
            <th>package kcal</th>
            <th>1gあたりkcal</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {foods.map((f) => (
            <tr key={f.id}>
              <td>{f.id}</td>
              <td>{f.food_name}</td>
              <td>{f.food_type ?? ""}</td>
              <td>{f.package_g ?? ""}</td>
              <td>{f.package_kcal ?? ""}</td>
              <td>{Number(f.kcal_per_g).toFixed(6)}</td>
              <td>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => startEdit(f)}>編集</button>
                  <button
                    onClick={() =>
                      del(f).catch((e: unknown) =>
                        setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
                      )
                    }
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {foods.length === 0 && (
            <tr>
              <td colSpan={7}>まだ登録がありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}