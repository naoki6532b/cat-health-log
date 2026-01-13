"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Meal = {
  id: number;
  dt: string;
  food_id: number | null;
  grams: number | null;
  kcal: number | null;
  note: string | null;
};

type Food = { id: number; food_name: string };

export default function MealsPage() {
  const [rows, setRows] = useState<Meal[]>([]);
  const [foodsMap, setFoodsMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [limit, setLimit] = useState(500); // 一覧表示件数（必要なら増やす）

  const load = async () => {
    setMsg("");
    try {
      // foods map
      const foodsRes = await apiFetch("/api/foods");
      if (!foodsRes.ok) throw new Error(await foodsRes.text());
      const foods = (await foodsRes.json()) as Food[];
      const map: Record<string, string> = {};
      for (const f of foods ?? []) map[String(f.id)] = f.food_name;
      setFoodsMap(map);

      // meals list（既存の recent を大きめlimitで流用）
      const res = await apiFetch(`/api/meals/recent?limit=${limit}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Meal[];
      setRows(data ?? []);
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e ?? "unknown"));
    }
  };

  const del = async (id: number) => {
    if (!confirm("この給餌ログを削除しますか？")) return;
    setMsg("");
    try {
      const res = await apiFetch(`/api/meals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await load();
      setMsg("削除しました");
    } catch (e: any) {
      setMsg("ERROR: " + String(e?.message ?? e ?? "unknown"));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  return (
    <main style={{ padding: 16, maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>給餌ログ 全一覧</h2>

        <Link href="/entry/meal" style={{ marginLeft: "auto" }}>
          給餌入力へ
        </Link>
      </div>

      {msg && <div style={{ color: msg.startsWith("ERROR") ? "red" : "green" }}>{msg}</div>}

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={load}>更新</button>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          表示件数
          <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="3000">3000</option>
          </select>
        </label>

        <div style={{ opacity: 0.8 }}>表示中: {rows.length}件</div>
      </div>

      <table border={1} cellPadding={6} style={{ width: "100%", marginTop: 12 }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>日時</th>
            <th>フード</th>
            <th>g</th>
            <th>kcal</th>
            <th>メモ</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{r.id}</td>
              <td>{new Date(r.dt).toLocaleString("ja-JP")}</td>
              <td>{r.food_id != null ? foodsMap[String(r.food_id)] ?? String(r.food_id) : "-"}</td>
              <td>{r.grams ?? "-"}</td>
              <td>{r.kcal ?? "-"}</td>
              <td>{r.note ?? ""}</td>
              <td>
                <div style={{ display: "flex", gap: 10 }}>
                  <Link href={`/meals/${String(r.id)}`}>修正</Link>
                  <button onClick={() => del(r.id)}>削除</button>
                </div>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={7}>まだ給餌ログがありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
