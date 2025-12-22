"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type MealRow = {
  dt: string; // ISO
  food_name: string;
  grams: number;
  kcal: number;
};

declare global {
  interface Window {
    google?: any;
  }
}

function loadGoogleCharts(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.charts) return resolve();

    const existing = document.querySelector('script[data-google-charts="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Charts")));
      return;
    }

    const s = document.createElement("script");
    s.src = "https://www.gstatic.com/charts/loader.js";
    s.async = true;
    s.dataset.googleCharts = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Charts"));
    document.head.appendChild(s);
  });
}

function toDateKey(dtIso: string) {
  return dtIso.slice(0, 10); // YYYY-MM-DD
}

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [msg, setMsg] = useState("");

  // 範囲UI
  const [preset, setPreset] = useState<"7" | "30" | "90" | "all" | "custom">("30");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDate(d);
  });
  const [toDate, setToDate] = useState<string>(() => isoDate(new Date()));

  const dailyChartRef = useRef<HTMLDivElement | null>(null);
  const groupChartRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setMsg("");
    const res = await apiFetch("/api/summary/meals");
    const data = (await res.json()) as MealRow[];
    setRows(data);
  };

  useEffect(() => {
    load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
  }, []);

  // 選択範囲を確定
  const range = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (preset === "all") return { from: null as Date | null, to: null as Date | null };

    if (preset === "custom") {
      const f = new Date(fromDate + "T00:00:00");
      const t = new Date(toDate + "T23:59:59");
      return { from: f, to: t };
    }

    const days = Number(preset);
    const f = new Date(today);
    f.setDate(f.getDate() - (days - 1));
    f.setHours(0, 0, 0, 0);
    return { from: f, to: end };
  }, [preset, fromDate, toDate]);

  // 範囲でフィルタ
  const rowsInRange = useMemo(() => {
    if (!range.from || !range.to) return rows;
    const fms = range.from.getTime();
    const tms = range.to.getTime();
    return rows.filter((r) => {
      const ms = new Date(r.dt).getTime();
      return ms >= fms && ms <= tms;
    });
  }, [rows, range]);

  // 15分以内を1回としてグルーピング（範囲適用後）
  const grouped15 = useMemo(() => {
    const r = [...rowsInRange].sort((a, b) => a.dt.localeCompare(b.dt));
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
  }, [rowsInRange]);

  // 日別合計（範囲適用後）
  const daily = useMemo(() => {
    const map = new Map<string, { date: string; totalKcal: number; totalG: number }>();
    for (const r of rowsInRange) {
      const d = toDateKey(r.dt);
      const cur = map.get(d) ?? { date: d, totalKcal: 0, totalG: 0 };
      cur.totalKcal += r.kcal;
      cur.totalG += r.grams;
      map.set(d, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rowsInRange]);

  // グラフ描画（範囲が変わるたび再描画）
  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      if (!dailyChartRef.current || !groupChartRef.current) return;
      if (rowsInRange.length === 0) return;

      await loadGoogleCharts();
      if (cancelled) return;

      const google = window.google;
      google.charts.load("current", { packages: ["corechart"] });

      google.charts.setOnLoadCallback(() => {
        if (cancelled) return;

        // 日別（折れ線）
        const dailyData = new google.visualization.DataTable();
        dailyData.addColumn("string", "日付");
        dailyData.addColumn("number", "kcal");
        dailyData.addRows(daily.map((d) => [d.date, Number(d.totalKcal.toFixed(1))]));

        const dailyChart = new google.visualization.LineChart(dailyChartRef.current);
        dailyChart.draw(dailyData, {
          title: "日別 摂取カロリー",
          legend: { position: "none" },
          height: 360,
          hAxis: { slantedText: true, slantedTextAngle: 45 },
          vAxis: { title: "kcal" },
        });

        // 15分ルール（棒）
        const gData = new google.visualization.DataTable();
        gData.addColumn("string", "開始");
        gData.addColumn("number", "kcal");

        const short = (iso: string) => iso.replace("T", " ").slice(0, 16);
        gData.addRows(grouped15.map((g) => [short(g.start), Number(g.totalKcal.toFixed(1))]));

        const groupChart = new google.visualization.ColumnChart(groupChartRef.current);
        groupChart.draw(gData, {
          title: "15分ルール：1回分の合計kcal",
          legend: { position: "none" },
          height: 360,
          hAxis: { slantedText: true, slantedTextAngle: 45 },
          vAxis: { title: "kcal" },
        });
      });
    };

    draw().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));

    const onResize = () => draw().catch(() => {});
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [rowsInRange, daily, grouped15]);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2>集計</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>再読込</button>

        <span style={{ marginLeft: 10 }}>表示範囲：</span>
        <button onClick={() => setPreset("7")}>直近7日</button>
        <button onClick={() => setPreset("30")}>直近30日</button>
        <button onClick={() => setPreset("90")}>直近90日</button>
        <button onClick={() => setPreset("all")}>全部（取得範囲内）</button>
        <button onClick={() => setPreset("custom")}>期間指定</button>

        {preset === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span>〜</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, color: "#555" }}>
        対象件数：{rowsInRange.length} 件
      </div>

      <h3 style={{ marginTop: 16 }}>グラフ</h3>
      <div ref={dailyChartRef} style={{ width: "100%", minHeight: 360, border: "1px solid #ddd" }} />
      <div style={{ height: 12 }} />
      <div ref={groupChartRef} style={{ width: "100%", minHeight: 360, border: "1px solid #ddd" }} />

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