"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MealRow = {
  dt: string;
  food_name: string;
  grams: number;
  kcal: number;
};

function toDateKey(dtIso: string) {
  return dtIso.slice(0, 10); // YYYY-MM-DD
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    const res = await apiFetch("/api/summary/meals");
    setRows(await res.json());
  };

  useEffect(() => {
    load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
  }, []);

  // 15分以内を1回としてグルーピング
  const grouped15 = useMemo(() => {
    const r = [...rows].sort((a, b) => a.dt.localeCompare(b.dt));
    const groups: { start: string; items: MealRow[]; totalKcal: number }[] = [];

    const toMs = (iso: string) => new Date(iso).getTime();

    for (const item of r) {
      const last = groups[groups.length - 1];
      if (!last) {
        groups.push({ start: item.dt, items: [item], totalKcal: item.kcal });
        continue;
      }
      const diffMin = (toMs(item.dt) - toMs(last.items[last.items.length - 1].dt)) / 60000;
      if (diffMin <= 15) {
        last.items.push(item);
        last.totalKcal += item.kcal;
      } else {
        groups.push({ start: item.dt, items: [item], totalKcal: item.kcal });
      }
    }
    return groups;
  }, [rows]);

  // 日別合計
  const daily = useMemo(() => {
    const map = new Map<string, { date: string; totalKcal: number; totalG: number }>();
    for (const r of rows) {
      const d = toDateKey(r.dt);
      const cur = map.get(d) ?? { date: d, totalKcal: 0, totalG: 0 };
      cur.totalKcal += r.kcal;
      cur.totalG += r.grams;
      map.set(d, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <h2>集計</h2>
      <div style={{ color: "red" }}>{msg}</div>
      <button onClick={() => load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>再読込</button>

      <h3 style={{ marginTop: 16 }}>15分ルール（1回分）</h3>
      <table border={1} cellPadding={6} style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>開始日時</th>
            <th>明細</th>
            <th>同時刻合計kcal</th>
          </tr>
        </thead>
        <tbody>
          {grouped15.map((g, idx) => (
            <tr key={idx}>
              <td>{g.start}</td>
              <td>
                {g.items.map((it, i) => (
                  <div key={i}>
                    {it.dt} / {it.food_name} / {it.grams}g / {it.kcal}kcal
                  </div>
                ))}
              </td>
              <td>{g.totalKcal.toFixed(1)}</td>
            </tr>
          ))}
          {grouped15.length === 0 && (
            <tr>
              <td colSpan={3}>データがありません</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>日別合計</h3>
      <table border={1} cellPadding={6} style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>日付</th>
            <th>合計g</th>
            <th>合計kcal</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.totalG.toFixed(1)}</td>
              <td>{d.totalKcal.toFixed(1)}</td>
            </tr>
          ))}
          {daily.length === 0 && (
            <tr>
              <td colSpan={3}>データがありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}