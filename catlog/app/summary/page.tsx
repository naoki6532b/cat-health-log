"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type MealRow = {
  dt: string; // ISO
  food_name: string;
  grams: number;
  kcal: number;

  // ★残り対応（APIが返す想定。無い場合でもフォールバック計算する）
  leftover_g?: number | null;
  kcal_per_g_snapshot?: number | null;

  // ★APIが返してくれるなら使う（無ければ計算）
  net_kcal?: number | null;
  net_grams?: number | null;
  leftover_kcal?: number | null;
};

type WeightRow = {
  id: number;
  dt: string; // ISO
  weight_kg: number;
  memo: string | null;
};

declare global {
  interface Window {
    google?: any;
  }
}

function loadGoogleCharts(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.charts) return resolve();

    const existing = document.querySelector(
      'script[data-google-charts="1"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Charts"))
      );
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
  const d = new Date(dtIso);
  // JSTで YYYY-MM-DD を作る（環境に依存しない）
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return s; // "YYYY-MM-DD"
}

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  return { y, m, d };
}

/**
 * ✅ X軸ラベル規則（あなた指定）
 * - 一番左の列：M/D（年が変わったら改行で年）
 * - それ以外：日だけ
 */
function dayLabel(ymd: string, isFirst: boolean, prevYmd: string | null) {
  const cur = parseYmd(ymd);
  const prev = prevYmd ? parseYmd(prevYmd) : null;

  const yearChanged = prev ? cur.y !== prev.y : true;

  if (isFirst) {
    const md = `${cur.m}/${cur.d}`;
    if (yearChanged) return `${md}\n${cur.y}`;
    return md;
  }

  return String(cur.d);
}

/**
 * ✅ 時間帯ラベル（あなた指定）
 * 朝: 5-11, 昼: 12-16, 夜: 17-23, 深夜: 0-4
 */
function dayPartLabel(hour: number) {
  if (hour >= 5 && hour <= 11) return "朝";
  if (hour >= 12 && hour <= 16) return "昼";
  if (hour >= 17 && hour <= 23) return "夜";
  return "深夜"; // 0-4
}

function labelForMealGroupStart(iso: string, prevIso: string | null) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours();

  const prev = prevIso ? new Date(prevIso) : null;
  const yearChanged = prev ? prev.getFullYear() !== y : true;

  const md = `${m}/${day}`;
  const part = dayPartLabel(hour);

  if (yearChanged) return `${md}\n${y}${part}`;
  return `${md}${part}`;
}

/**
 * ✅ 7日移動平均（null は除外）
 */
function movingAvg7(values: Array<number | null>): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const v = values[j];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        cnt++;
      }
    }
    out.push(cnt > 0 ? sum / cnt : null);
  }
  return out;
}

/**
 * ★実食計算（APIが net を返さない場合のフォールバック）
 */
function calcNet(m: MealRow) {
  const grams = Number(m.grams ?? 0);
  const kcal = Number(m.kcal ?? 0);

  const leftover_g = Number(m.leftover_g ?? 0);
  const snap = Number(m.kcal_per_g_snapshot ?? NaN);

  // APIが既に返すならそれを優先
  const net_kcal_from_api =
    m.net_kcal != null && Number.isFinite(Number(m.net_kcal))
      ? Number(m.net_kcal)
      : null;

  const net_grams_from_api =
    m.net_grams != null && Number.isFinite(Number(m.net_grams))
      ? Number(m.net_grams)
      : null;

  const leftover_kcal_from_api =
    m.leftover_kcal != null && Number.isFinite(Number(m.leftover_kcal))
      ? Number(m.leftover_kcal)
      : null;

  // 自前計算
  const net_grams =
    net_grams_from_api != null ? net_grams_from_api : Math.max(0, grams - leftover_g);

  const leftover_kcal =
    leftover_kcal_from_api != null
      ? leftover_kcal_from_api
      : Number.isFinite(snap)
        ? Math.max(0, leftover_g * snap)
        : 0;

  const net_kcal =
    net_kcal_from_api != null
      ? net_kcal_from_api
      : Number.isFinite(snap)
        ? Math.max(0, kcal - leftover_g * snap)
        : kcal;

  return {
    net_grams,
    net_kcal,
    leftover_kcal,
  };
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [msg, setMsg] = useState("");

  // 範囲UI
  const [preset, setPreset] = useState<"7" | "30" | "90" | "all" | "custom">("30");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDate(d);
  });
  const [toDate, setToDate] = useState<string>(() => isoDate(new Date()));

  const comboChartRef = useRef<HTMLDivElement | null>(null);
  const dailyChartRef = useRef<HTMLDivElement | null>(null);
  const groupChartRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setMsg("");

    const [mRes, wRes] = await Promise.all([
      apiFetch("/api/summary/meals"),
      apiFetch("/api/weights?days=365"),
    ]);

    if (!mRes.ok) {
      const t = await mRes.text().catch(() => "");
      throw new Error(t || `HTTP ${mRes.status}`);
    }
    if (!wRes.ok) {
      const t = await wRes.text().catch(() => "");
      throw new Error(t || `HTTP ${wRes.status}`);
    }

    const meals = (await mRes.json()) as MealRow[];
    const wJson = (await wRes.json()) as { data: WeightRow[] };

    setRows(meals ?? []);
    setWeights(wJson?.data ?? []);
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

  // meals 範囲フィルタ
  const rowsInRange = useMemo(() => {
    if (!range.from || !range.to) return rows;
    const fms = range.from.getTime();
    const tms = range.to.getTime();
    return rows.filter((r) => {
      const ms = new Date(r.dt).getTime();
      return ms >= fms && ms <= tms;
    });
  }, [rows, range]);

  // weights 範囲フィルタ
  const weightsInRange = useMemo(() => {
    if (!range.from || !range.to) return weights;
    const fms = range.from.getTime();
    const tms = range.to.getTime();
    return weights.filter((w) => {
      const ms = new Date(w.dt).getTime();
      return ms >= fms && ms <= tms;
    });
  }, [weights, range]);

  // 15分以内を1回としてグルーピング（範囲適用後）
  // ★合計は net_kcal（実食）で計算
  const grouped15 = useMemo(() => {
    const r = [...rowsInRange].sort((a, b) => a.dt.localeCompare(b.dt));
    const groups: { start: string; items: MealRow[]; totalNetKcal: number; totalLeftoverKcal: number }[] = [];
    const toMs = (iso: string) => new Date(iso).getTime();

    for (const item of r) {
      const { net_kcal, leftover_kcal } = calcNet(item);

      const last = groups[groups.length - 1];
      if (!last) {
        groups.push({
          start: item.dt,
          items: [item],
          totalNetKcal: net_kcal,
          totalLeftoverKcal: leftover_kcal,
        });
        continue;
      }
      const diffMin =
        (toMs(item.dt) - toMs(last.items[last.items.length - 1].dt)) / 60000;

      if (diffMin <= 15) {
        last.items.push(item);
        last.totalNetKcal += net_kcal;
        last.totalLeftoverKcal += leftover_kcal;
      } else {
        groups.push({
          start: item.dt,
          items: [item],
          totalNetKcal: net_kcal,
          totalLeftoverKcal: leftover_kcal,
        });
      }
    }
    return groups;
  }, [rowsInRange]);

  // 日別合計（範囲適用後）
  // ★日別合計も net_kcal（実食）で計算
  const daily = useMemo(() => {
    const map = new Map<
      string,
      { date: string; totalNetKcal: number; totalLeftoverKcal: number; totalG: number; totalNetG: number }
    >();

    for (const r of rowsInRange) {
      const d = toDateKey(r.dt);
      const cur = map.get(d) ?? { date: d, totalNetKcal: 0, totalLeftoverKcal: 0, totalG: 0, totalNetG: 0 };

      const { net_kcal, leftover_kcal, net_grams } = calcNet(r);

      cur.totalNetKcal += net_kcal;
      cur.totalLeftoverKcal += leftover_kcal;
      cur.totalG += Number(r.grams ?? 0);
      cur.totalNetG += net_grams;

      map.set(d, cur);
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rowsInRange]);

  // ✅ 日別体重（同日に複数あるなら「その日の最新」を採用）
  const dailyWeightMap = useMemo(() => {
    const map = new Map<string, { date: string; weightKg: number; dt: string }>();
    const sorted = [...weightsInRange].sort((a, b) => a.dt.localeCompare(b.dt));
    for (const w of sorted) {
      const d = toDateKey(w.dt);
      map.set(d, { date: d, weightKg: Number(w.weight_kg), dt: w.dt });
    }
    return map;
  }, [weightsInRange]);

  // ✅ kcal(日別net) と 体重(日別) を同じX軸でマージ
  const mergedDaily = useMemo(() => {
    const set = new Set<string>();
    for (const d of daily) set.add(d.date);
    for (const k of dailyWeightMap.keys()) set.add(k);

    const dates = Array.from(set).sort((a, b) => a.localeCompare(b));

    const kcalMap = new Map(daily.map((d) => [d.date, d.totalNetKcal]));
    const leftoverMap = new Map(daily.map((d) => [d.date, d.totalLeftoverKcal]));

    const base = dates.map((date, i) => {
      const kcal = kcalMap.get(date) ?? null;
      const leftover = leftoverMap.get(date) ?? null;
      const w = dailyWeightMap.get(date)?.weightKg ?? null;

      const label = dayLabel(date, i === 0, i === 0 ? null : dates[i - 1]);

      return { date, label, kcal, leftoverKcal: leftover, weightKg: w };
    });

    const weightSeries = base.map((d) => d.weightKg);
    const avg7 = movingAvg7(weightSeries);

    return base.map((d, i) => ({
      ...d,
      weightAvg7: avg7[i],
    }));
  }, [daily, dailyWeightMap]);

  // グラフ描画
  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      if (!comboChartRef.current || !dailyChartRef.current || !groupChartRef.current) return;
      if (rowsInRange.length === 0 && weightsInRange.length === 0) return;

      await loadGoogleCharts();
      if (cancelled) return;

      const google = window.google;
      google.charts.load("current", { packages: ["corechart"] });

      google.charts.setOnLoadCallback(() => {
        if (cancelled) return;

        // ========= 体重×kcal（2軸 + 体重7日平均） =========
        // ★kcalは net（実食）を使用
        const comboData = new google.visualization.DataTable();
        comboData.addColumn("string", "日付");
        comboData.addColumn("number", "実食kcal");
        comboData.addColumn("number", "体重(kg)");
        comboData.addColumn("number", "体重(7日平均)");

        comboData.addRows(
          mergedDaily.map((d) => [
            d.label,
            d.kcal === null ? null : Number(d.kcal.toFixed(1)),
            d.weightKg === null ? null : Number(Number(d.weightKg).toFixed(2)),
            d.weightAvg7 === null ? null : Number(Number(d.weightAvg7).toFixed(2)),
          ])
        );

        const comboChart = new google.visualization.ComboChart(comboChartRef.current);
        comboChart.draw(comboData, {
          title: "体重 × 実食カロリー（体重は7日移動平均付き）",
          height: 380,
          legend: { position: "bottom" },
          seriesType: "line",
          series: {
            0: { targetAxisIndex: 0 }, // kcal
            1: { targetAxisIndex: 1 }, // weight
            2: { targetAxisIndex: 1 }, // weight avg7
          },
          vAxes: {
            0: { title: "kcal" },
            1: { title: "kg" },
          },
          hAxis: { slantedText: false },
        });

        // ========= 日別（折れ線：実食kcal） =========
        const dailyData = new google.visualization.DataTable();
        dailyData.addColumn("string", "日付");
        dailyData.addColumn("number", "実食kcal");

        const dates = daily.map((d) => d.date);
        const labels = dates.map((ymd, i) =>
          dayLabel(ymd, i === 0, i === 0 ? null : dates[i - 1])
        );

        dailyData.addRows(
          daily.map((d, i) => [labels[i], Number(d.totalNetKcal.toFixed(1))])
        );

        const dailyChart = new google.visualization.LineChart(dailyChartRef.current);
        dailyChart.draw(dailyData, {
          title: "日別 実食カロリー（お残し減算済み）",
          legend: { position: "none" },
          height: 360,
          hAxis: { slantedText: false },
          vAxis: { title: "kcal" },
        });

        // ========= 15分ルール（棒：1回分の実食kcal） =========
        const gData = new google.visualization.DataTable();
        gData.addColumn("string", "開始");
        gData.addColumn("number", "実食kcal");

        const sortedGroups = [...grouped15].sort((a, b) => a.start.localeCompare(b.start));
        const labels15 = sortedGroups.map((g, i) =>
          labelForMealGroupStart(g.start, i === 0 ? null : sortedGroups[i - 1].start)
        );

        gData.addRows(
          sortedGroups.map((g, i) => [
            labels15[i],
            Number(g.totalNetKcal.toFixed(1)),
          ])
        );

        const groupChart = new google.visualization.ColumnChart(groupChartRef.current);
        groupChart.draw(gData, {
          title: "15分ルール：1回分の実食kcal（朝/昼/夜/深夜）",
          legend: { position: "none" },
          height: 360,
          hAxis: { slantedText: false, slantedTextAngle: 45 },
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
  }, [rowsInRange, weightsInRange, daily, grouped15, mergedDaily]);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2>集計</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))}>
          再読込
        </button>

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
        給餌：{rowsInRange.length} 件 / 体重：{weightsInRange.length} 件
      </div>

      <h3 style={{ marginTop: 16 }}>体重 × 実食kcal（体重7日移動平均つき）</h3>
      <div ref={comboChartRef} style={{ width: "100%", minHeight: 380, border: "1px solid #ddd" }} />

      <h3 style={{ marginTop: 16 }}>グラフ</h3>
      <div ref={dailyChartRef} style={{ width: "100%", minHeight: 360, border: "1px solid #ddd" }} />
      <div style={{ height: 12 }} />
      <div ref={groupChartRef} style={{ width: "100%", minHeight: 360, border: "1px solid #ddd" }} />

      <h3 style={{ marginTop: 16 }}>日別合計（お残し減算）</h3>
     <h3 style={{ marginTop: 16 }}>日別合計（お残し減算）</h3>

<table
  border={1}
  cellPadding={6}
  style={{
    width: "100%",
    textAlign: "center",      // ★ヘッダも本文も全部センター
    borderCollapse: "collapse",
  }}
>
  <thead>
    <tr>
      <th style={{ textAlign: "center" }}>日付</th>
      <th style={{ textAlign: "center" }}>置いた合計g</th>
      <th style={{ textAlign: "center" }}>実食合計g</th>
      <th style={{ textAlign: "center" }}>お残しkcal</th>
      <th style={{ textAlign: "center" }}>実食kcal</th>
    </tr>
  </thead>
  <tbody>
    {daily.map((d) => (
      <tr key={d.date}>
        <td style={{ textAlign: "center" }}>{d.date}</td>
        <td style={{ textAlign: "center" }}>{d.totalG.toFixed(1)}</td>
        <td style={{ textAlign: "center" }}>{d.totalNetG.toFixed(1)}</td>
        <td style={{ textAlign: "center" }}>{d.totalLeftoverKcal.toFixed(1)}</td>
        <td style={{ textAlign: "center" }}>{d.totalNetKcal.toFixed(1)}</td>
      </tr>
    ))}
    {daily.length === 0 && (
      <tr>
        <td colSpan={5} style={{ textAlign: "center" }}>
          データがありません
        </td>
      </tr>
    )}
  </tbody>
</table>

    </main>
  );
}
