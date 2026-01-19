"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type MealRow = {
  dt: string; // ISO
  food_name: string;
  grams: number;
  kcal: number;

  leftover_g?: number | null;
  kcal_per_g_snapshot?: number | null;

  net_kcal?: number | null;
  net_grams?: number | null;
  leftover_kcal?: number | null;
};

type WeightRow = {
  id: number;
  dt: string; // ISO
  weight_kg: number | null;
  memo: string | null;
};

declare global {
  interface Window {
    google?: any;
  }
}

/** Google Charts は1回だけロードして使い回す（重さ対策） */
let chartsReadyPromise: Promise<void> | null = null;

function loadGoogleChartsScript(): Promise<void> {
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

function ensureChartsReady(): Promise<void> {
  if (chartsReadyPromise) return chartsReadyPromise;

  chartsReadyPromise = (async () => {
    await loadGoogleChartsScript();
    const google = window.google;
    google.charts.load("current", { packages: ["corechart"] });
    await new Promise<void>((resolve) =>
      google.charts.setOnLoadCallback(() => resolve())
    );
  })();

  return chartsReadyPromise;
}

// JSTで YYYY-MM-DD を作る（環境依存しない）
function toDateKey(dtIso: string) {
  const d = new Date(dtIso);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "YYYY-MM-DD"
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
 * ✅ X軸ラベル規則
 * - 一番左：M/D（年が変わったら改行で年）
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
 * ✅ 時間帯ラベル
 * 朝: 5-11, 昼: 12-16, 夜: 17-23, 深夜: 0-4
 */
function dayPartLabel(hour: number) {
  if (hour >= 5 && hour <= 11) return "朝";
  if (hour >= 12 && hour <= 16) return "昼";
  if (hour >= 17 && hour <= 23) return "夜";
  return "深夜";
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
 * ✅ 直近N回の観測値で移動平均（欠測日は null）
 */
function movingAvgLastNObservations(
  values: Array<number | null>,
  n: number
): Array<number | null> {
  const out: Array<number | null> = [];
  const buf: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      buf.push(v);
      if (buf.length > n) buf.shift();
      const avg = buf.reduce((s, x) => s + x, 0) / buf.length;
      out.push(avg);
    } else {
      out.push(null);
    }
  }
  return out;
}

/**
 * ✅ 日別kcal用：直近7点の移動平均（軽量）
 */
function movingAvg7Window(values: number[]): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const v = values[j];
      if (Number.isFinite(v)) {
        sum += v;
        cnt++;
      }
    }
    out.push(cnt ? sum / cnt : null);
  }
  return out;
}

/**
 * ★実食計算（APIが net / leftover を返さない場合のフォールバック）
 * ✅ snapshotが無くても net_kcal があれば leftover_kcal = kcal - net_kcal を逆算する
 */
function calcNet(m: MealRow) {
  const grams = Number(m.grams ?? 0);
  const kcal = Number(m.kcal ?? 0);

  const leftover_g = Number(m.leftover_g ?? 0);
  const snap = Number(m.kcal_per_g_snapshot ?? NaN);

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

  const net_grams =
    net_grams_from_api != null
      ? net_grams_from_api
      : Math.max(0, grams - leftover_g);

  const net_kcal =
    net_kcal_from_api != null
      ? net_kcal_from_api
      : Number.isFinite(snap)
      ? Math.max(0, kcal - leftover_g * snap)
      : kcal;

  const leftover_kcal =
    leftover_kcal_from_api != null
      ? leftover_kcal_from_api
      : Number.isFinite(snap)
      ? Math.max(0, leftover_g * snap)
      : Number.isFinite(net_kcal)
      ? Math.max(0, kcal - net_kcal)
      : 0;

  return { net_grams, net_kcal, leftover_kcal };
}

/** 表示範囲内の連続日付（YYYY-MM-DD配列）を作る（最大3650日） */
function buildDateSeries(from: Date, to: Date) {
  const out: string[] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  const guardMax = 3650 + 5;
  let guard = 0;

  while (d.getTime() <= end.getTime()) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
    guard++;
    if (guard > guardMax) break;
  }
  return out;
}

/** preset/custom から API取得用の days を決める（all は上限3650） */
function presetToDays(preset: "7" | "30" | "90" | "all" | "custom") {
  if (preset === "7") return 7;
  if (preset === "30") return 30;
  if (preset === "90") return 90;
  if (preset === "all") return 3650;
  return 365;
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [msg, setMsg] = useState("");

  // ✅ デフォルト直近30日
  const [preset, setPreset] = useState<"7" | "30" | "90" | "all" | "custom">(
    "30"
  );

  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDate(d);
  });
  const [toDate, setToDate] = useState<string>(() => isoDate(new Date()));

  const groupChartRef = useRef<HTMLDivElement | null>(null);
  const dailyChartRef = useRef<HTMLDivElement | null>(null);
  const weightChartRef = useRef<HTMLDivElement | null>(null);

  /** 取得（プリセット/期間指定に応じてできるだけ小さく取る＝軽量化） */
  const load = async (p = preset, f = fromDate, t = toDate) => {
    setMsg("");

    const days = presetToDays(p);

    const mealsUrl =
      p === "custom"
        ? `/api/summary/meals?from=${f}&to=${t}`
        : `/api/summary/meals?days=${days}`;

    const weightsUrl =
      p === "custom"
        ? `/api/weights?from=${f}&to=${t}`
        : `/api/weights?days=${days}`;

    const [mRes, wRes] = await Promise.all([
      apiFetch(mealsUrl),
      apiFetch(weightsUrl),
    ]);

    if (!mRes.ok) {
      const txt = await mRes.text().catch(() => "");
      throw new Error(txt || `Meals HTTP ${mRes.status}`);
    }
    if (!wRes.ok) {
      const txt = await wRes.text().catch(() => "");
      throw new Error(txt || `Weights HTTP ${wRes.status}`);
    }

    const meals = (await mRes.json()) as MealRow[];
    const wJson = (await wRes.json()) as { data: WeightRow[] };

    setRows(meals ?? []);
    setWeights(wJson?.data ?? []);
  };

  // 初回ロード
  useEffect(() => {
    load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 選択範囲を確定（表示用）
  const range = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (preset === "all")
      return { from: null as Date | null, to: null as Date | null };

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

  // 15分以内を1回としてグルーピング
  const grouped15 = useMemo(() => {
    const r = [...rows].sort((a, b) => a.dt.localeCompare(b.dt));
    const groups: {
      start: string;
      items: MealRow[];
      totalNetKcal: number;
      totalLeftoverKcal: number;
    }[] = [];
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
  }, [rows]);

  /**
   * ✅ 日別合計（kcalで統一）
   * - 給餌(kcal) / お残し(kcal) / 実食(kcal)
   */
  const daily = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        feedKcal: number;
        leftoverKcal: number;
        netKcal: number;
      }
    >();

    for (const r of rows) {
      const d = toDateKey(r.dt);

      const cur =
        map.get(d) ?? {
          date: d,
          feedKcal: 0,
          leftoverKcal: 0,
          netKcal: 0,
        };

      const kcalPlaced = Number(r.kcal ?? 0);
      const { net_kcal, leftover_kcal } = calcNet(r);

      cur.feedKcal += kcalPlaced;
      cur.leftoverKcal += leftover_kcal;
      cur.netKcal += net_kcal;

      map.set(d, cur);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [rows]);

  /**
   * ✅ 日別体重：同日に複数あるなら「その日の最新」を採用
   * ✅ 0/null/NaN/負は採用しない
   */
  const dailyWeightMap = useMemo(() => {
    const map = new Map<string, { date: string; weightKg: number; dt: string }>();
    const sorted = [...weights].sort((a, b) => a.dt.localeCompare(b.dt));

    for (const w of sorted) {
      const d = toDateKey(w.dt);
      const kg = Number(w.weight_kg);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      map.set(d, { date: d, weightKg: kg, dt: w.dt });
    }
    return map;
  }, [weights]);

  /**
   * ✅ 体重系列：欠測日は null
   * ✅ 前後に計測があれば interpolateNulls で線がつながる
   */
  const weightSeriesForChart = useMemo(() => {
    let f: Date;
    let t: Date;

    if (!range.from || !range.to) {
      const today = new Date();
      t = new Date(today);
      t.setHours(23, 59, 59, 999);
      f = new Date(today);
      f.setDate(f.getDate() - 3649);
      f.setHours(0, 0, 0, 0);
    } else {
      f = new Date(range.from);
      t = new Date(range.to);
    }

    const dates = buildDateSeries(f, t);

    const base = dates.map((date, i) => {
      const label = dayLabel(date, i === 0, i === 0 ? null : dates[i - 1]);
      const w = dailyWeightMap.get(date)?.weightKg ?? null;
      return { date, label, weightKg: w };
    });

    const avg7 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      7
    );

    return base.map((x, i) => ({
      ...x,
      weightAvg7: x.weightKg == null ? null : avg7[i],
    }));
  }, [dailyWeightMap, range.from, range.to]);

  /** 日別実食カロリー（棒 + 7日平均線用） */
  const dailyForChart = useMemo(() => {
    const map = new Map<string, { date: string; totalNetKcal: number }>();
    for (const r of rows) {
      const d = toDateKey(r.dt);
      const cur = map.get(d) ?? { date: d, totalNetKcal: 0 };
      const { net_kcal } = calcNet(r);
      cur.totalNetKcal += net_kcal;
      map.set(d, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const dailyKcalSeries = useMemo(() => {
    const dates = dailyForChart.map((d) => d.date);
    const labels = dates.map((ymd, i) =>
      dayLabel(ymd, i === 0, i === 0 ? null : dates[i - 1])
    );
    const kcal = dailyForChart.map((d) => Number(d.totalNetKcal.toFixed(1)));
    const avg7 = movingAvg7Window(kcal).map((v) =>
      v == null ? null : Number(v.toFixed(1))
    );
    return { labels, kcal, avg7 };
  }, [dailyForChart]);

  // グラフ描画（仕様そのまま）
  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      if (!groupChartRef.current || !dailyChartRef.current || !weightChartRef.current)
        return;
      if (rows.length === 0 && weights.length === 0) return;

      await ensureChartsReady();
      if (cancelled) return;

      const google = window.google;

      const baseChartStyle = {
        backgroundColor: "#f5f6f8",
        chartArea: {
          left: 60,
          top: 40,
          width: "85%",
          height: "70%",
          backgroundColor: { fill: "#ffffff", rx: 14, ry: 14 },
        },
        annotations: {
          alwaysOutside: false,
          stem: { length: 5 },
          textStyle: { fontSize: 10, color: "#333", bold: false },
        },
        hAxis: { slantedText: false },
      } as const;

      // ===== 15分ルール：棒 =====
      {
        const gData = new google.visualization.DataTable();
        gData.addColumn("string", "開始");
        gData.addColumn("number", "実食kcal");
        gData.addColumn({ type: "number", role: "annotation" });

        const sortedGroups = [...grouped15].sort((a, b) => a.start.localeCompare(b.start));

        const labels15 = sortedGroups.map((g, i) =>
          labelForMealGroupStart(g.start, i === 0 ? null : sortedGroups[i - 1].start)
        );

        gData.addRows(
          sortedGroups.map((g, i) => {
            const v = Number(g.totalNetKcal.toFixed(1));
            return [labels15[i], v, v];
          })
        );

        const chart = new google.visualization.ColumnChart(groupChartRef.current);
        chart.draw(gData, {
          ...baseChartStyle,
          title: "15分ルール：1回分の実食kcal（朝/昼/夜/深夜）",
          height: 360,
          legend: { position: "none" },
          colors: ["#6ec6ff"],
          hAxis: { slantedText: false, slantedTextAngle: 45 },
          vAxis: {
            title: "kcal",
            gridlines: { color: "#e0e0e0" },
            minorGridlines: { color: "#b0b0b0", count: 4 },
          },
        });
      }

      // ===== 日別 実食kcal（棒 + 7日平均線） =====
      {
        const dData = new google.visualization.DataTable();
        dData.addColumn("string", "日付");
        dData.addColumn("number", "実食kcal");
        dData.addColumn({ type: "number", role: "annotation" });
        dData.addColumn("number", "7日平均");
        dData.addColumn({ type: "number", role: "annotation" });

        const rowsForChart = dailyKcalSeries.labels.map((label, i) => {
          const v = dailyKcalSeries.kcal[i];
          const a = dailyKcalSeries.avg7[i];
          return [
            label,
            Number.isFinite(v) ? v : null,
            Number.isFinite(v) ? v : null,
            a == null ? null : a,
            a == null ? null : a,
          ];
        });

        dData.addRows(rowsForChart);

        const chart = new google.visualization.ComboChart(dailyChartRef.current);
        chart.draw(dData, {
          ...baseChartStyle,
          title: "日別 実食カロリー（棒）＋ 7日平均（線）",
          height: 360,
          legend: { position: "bottom" },
          seriesType: "bars",
          series: {
            0: { type: "bars" },
            1: { type: "line" },
          },
          colors: ["#4facfe", "#7bd3ff"],
          vAxis: {
            title: "kcal",
            gridlines: { color: "#e0e0e0" },
            minorGridlines: { color: "#b0b0b0", count: 4 },
          },
        });
      }

      // ===== 体重（折れ線 + 7回平均） =====
      {
        const wData = new google.visualization.DataTable();
        wData.addColumn("string", "日付");
        wData.addColumn("number", "体重(kg)");
        wData.addColumn({ type: "number", role: "annotation" });
        wData.addColumn("number", "体重(7回平均)");
        wData.addColumn({ type: "number", role: "annotation" });

        wData.addRows(
          weightSeriesForChart.map((d: any) => [
            d.label,
            d.weightKg == null ? null : Number(Number(d.weightKg).toFixed(2)),
            d.weightKg == null ? null : Number(Number(d.weightKg).toFixed(2)),
            d.weightAvg7 == null ? null : Number(Number(d.weightAvg7).toFixed(2)),
            d.weightAvg7 == null ? null : Number(Number(d.weightAvg7).toFixed(2)),
          ])
        );

        const chart = new google.visualization.LineChart(weightChartRef.current);
        chart.draw(wData, {
          ...baseChartStyle,
          title: "体重推移（欠測日は非表示・前後計測があれば線で接続）",
          height: 360,
          legend: { position: "bottom" },
          interpolateNulls: true,
          vAxis: {
            title: "kg",
            viewWindow: { min: 1, max: 7 },
            gridlines: { color: "#e0e0e0" },
            minorGridlines: { color: "#bdbdbd", count: 4 },
          },
        });
      }
    };

    draw().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));

    const onResize = () => draw().catch(() => {});
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [rows, weights, grouped15, weightSeriesForChart, dailyKcalSeries]);

  const onPreset = (p: "7" | "30" | "90" | "all" | "custom") => {
    setPreset(p);
    if (p !== "custom") {
      load(p).catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    }
  };

  const onCustomApply = () => {
    setPreset("custom");
    load("custom", fromDate, toDate).catch((e) =>
      setMsg("ERROR: " + String(e?.message ?? e))
    );
  };

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2>集計</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      {/* ✅ 操作UI：スマホでは角丸長方形ボタンになる（派手すぎない） */}
      <div className="summary-toolbar">
        <button
          className="summary-reload-btn"
          onClick={() =>
            load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))
          }
        >
          再読込
        </button>

        <div className="summary-range-box">
          <span className="summary-range-label">表示範囲：</span>

          <div className="summary-range-buttons">
            <button
              className={`summary-range-btn ${preset === "7" ? "active" : ""}`}
              onClick={() => onPreset("7")}
            >
              直近7日
            </button>

            <button
              className={`summary-range-btn ${preset === "30" ? "active" : ""}`}
              onClick={() => onPreset("30")}
            >
              直近30日
            </button>

            <button
              className={`summary-range-btn ${preset === "90" ? "active" : ""}`}
              onClick={() => onPreset("90")}
            >
              直近90日
            </button>

            <button
              className={`summary-range-btn ${preset === "all" ? "active" : ""}`}
              onClick={() => onPreset("all")}
            >
              全部（最大10年）
            </button>

            <button
              className={`summary-range-btn ${preset === "custom" ? "active" : ""}`}
              onClick={() => setPreset("custom")}
            >
              期間指定
            </button>
          </div>

          {preset === "custom" && (
            <div className="summary-custom-range">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span>〜</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
              <button className="summary-apply-btn" onClick={onCustomApply}>
                適用
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10, color: "#555" }}>
        給餌：{rows.length} 件 / 体重：{weights.length} 件（取得済み）
      </div>

      {/* ✅ 表示順：15分 → 日別実食 → 日別合計 → 体重 */}
      <h3 style={{ marginTop: 16 }}>
        15分ルール：1回分の実食kcal（棒） / データラベル近め
      </h3>
      <div
        ref={groupChartRef}
        style={{
          width: "100%",
          minHeight: 360,
          border: "1px solid #ddd",
          borderRadius: 16,
          overflow: "hidden",
        }}
      />

      <h3 style={{ marginTop: 16 }}>
        日別 実食カロリー（棒）＋ 7日平均（線） / データラベル近め
      </h3>
      <div
        ref={dailyChartRef}
        style={{
          width: "100%",
          minHeight: 360,
          border: "1px solid #ddd",
          borderRadius: 16,
          overflow: "hidden",
        }}
      />

      <h3 style={{ marginTop: 16 }}>日別合計（kcalで統一）</h3>

      <table className="daily-kcal-table">
        <thead>
          <tr>
            <th style={{ textAlign: "center" }}>日付</th>
            <th style={{ textAlign: "center" }}>給餌(kcal)</th>
            <th style={{ textAlign: "center" }}>お残し(kcal)</th>
            <th style={{ textAlign: "center" }}>実食(kcal)</th>
          </tr>
        </thead>

        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <td data-label="日付" style={{ textAlign: "center" }}>
                {d.date}
              </td>
              <td data-label="給餌(kcal)" style={{ textAlign: "center" }}>
                {d.feedKcal.toFixed(1)}
              </td>
              <td data-label="お残し(kcal)" style={{ textAlign: "center" }}>
                {d.leftoverKcal.toFixed(1)}
              </td>
              <td data-label="実食(kcal)" style={{ textAlign: "center" }}>
                {d.netKcal.toFixed(1)}
              </td>
            </tr>
          ))}

          {daily.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center" }}>
                データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>
        体重（データラベル近め / 欠測は前後計測があれば接続 / 1〜7kg固定）
      </h3>
      <div
        ref={weightChartRef}
        style={{
          width: "100%",
          minHeight: 360,
          border: "1px solid #ddd",
          borderRadius: 16,
          overflow: "hidden",
        }}
      />
    </main>
  );
}
