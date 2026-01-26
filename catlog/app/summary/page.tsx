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
function jstYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "YYYY-MM-DD"
}

// YYYY-MM-DD を delta 日ずらした YYYY-MM-DD（JST基準）
function addDaysYmd(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return jstYmd(d);
}

// JSTで YYYY-MM-DD を作る（食事の日別集計キー）
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
 * ✅ X軸ラベル規則（グラフ2/体重で使用）
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

/** JST基準で year/month/day/hour を安定して取り出す */
function getJstParts(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);

  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    y: pick("year"),
    m: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
  };
}

/**
 * ✅ グラフ1（15分ルール）X軸ラベル
 * - 先頭：M/D{朝昼夜深夜}\nYYYY
 * - 年が変わった：M/D{...}\nYYYY
 * - 月が変わった：M/D{...}
 * - 同月同年：D{...}  ← 23昼, 23夜, 24朝...
 */
function labelForMealGroupStart(iso: string, prevIso: string | null) {
  const cur = getJstParts(iso);
  const part = dayPartLabel(cur.hour);

  if (!prevIso) {
    return `${cur.m}/${cur.day}${part}\n${cur.y}`;
  }

  const prev = getJstParts(prevIso);

  if (cur.y !== prev.y) {
    return `${cur.m}/${cur.day}${part}\n${cur.y}`;
  }

  if (cur.m !== prev.m) {
    return `${cur.m}/${cur.day}${part}`;
  }

  return `${cur.day}${part}`;
}

/** 直近N回の観測値で移動平均（欠測日は null） */
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

/** 日別kcal用：直近7点の移動平均（軽量） */
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

type Preset = "3" | "7" | "30" | "90" | "custom";

function presetDays(p: Preset) {
  if (p === "3") return 3;
  if (p === "7") return 7;
  if (p === "30") return 30;
  if (p === "90") return 90;
  return 7; // custom時は未使用
}

function buildTicks(min: number, max: number) {
  const span = max - min;
  const step = span > 12 ? 1 : 0.05; // 広がりすぎたら刻みを粗く
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) {
    const vv = Math.round(v * 100) / 100;
    if (vv >= min - 1e-9 && vv <= max + 1e-9) out.push(vv);
    if (out.length > 80) break;
  }
  return out;
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [msg, setMsg] = useState("");

  // ✅ デフォルト：直近7日
  const [preset, setPreset] = useState<Preset>("7");

  // ✅ プリセットの「表示窓」を前後移動するためのオフセット（日）
  // offset=0 は「今日を終端」
  const [offsetDays, setOffsetDays] = useState<number>(0);

  // ✅ 期間指定（custom）
  const [fromDate, setFromDate] = useState<string>(() => {
    const today = jstYmd(new Date());
    return addDaysYmd(today, -6); // デフォの入力値として 7日
  });
  const [toDate, setToDate] = useState<string>(() => jstYmd(new Date()));

  const groupChartRef = useRef<HTMLDivElement | null>(null);
  const dailyChartRef = useRef<HTMLDivElement | null>(null);
  const weightChartRef = useRef<HTMLDivElement | null>(null);

  // ✅ 現在表示している「実際の from/to（YYYY-MM-DD）」を決める
  const activeRangeYmd = useMemo(() => {
    if (preset === "custom") {
      return { from: fromDate, to: toDate, days: null as number | null };
    }

    const days = presetDays(preset);
    const today = jstYmd(new Date());
    const to = addDaysYmd(today, -offsetDays);
    const from = addDaysYmd(to, -(days - 1));
    return { from, to, days };
  }, [preset, fromDate, toDate, offsetDays]);

  /** ✅ 取得：常に from/to で取る（<>前後移動を成立させる） */
  const load = async (from: string, to: string) => {
    setMsg("");

    const mealsUrl = `/api/summary/meals?from=${from}&to=${to}`;
    const weightsUrl = `/api/weights?from=${from}&to=${to}`;

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

  // ✅ 初回ロード＆表示範囲が変わったらロード
  useEffect(() => {
    load(activeRangeYmd.from, activeRangeYmd.to).catch((e) =>
      setMsg("ERROR: " + String(e?.message ?? e))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRangeYmd.from, activeRangeYmd.to]);

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

  /** ✅ 日別合計（kcalで統一） */
  const daily = useMemo(() => {
    const map = new Map<
      string,
      { date: string; feedKcal: number; leftoverKcal: number; netKcal: number }
    >();

    for (const r of rows) {
      const d = toDateKey(r.dt);
      const cur =
        map.get(d) ?? { date: d, feedKcal: 0, leftoverKcal: 0, netKcal: 0 };

      const kcalPlaced = Number(r.kcal ?? 0);
      const { net_kcal, leftover_kcal } = calcNet(r);

      cur.feedKcal += kcalPlaced;
      cur.leftoverKcal += leftover_kcal;
      cur.netKcal += net_kcal;

      map.set(d, cur);
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  /** ✅ 日別体重：同日に複数あるなら「その日の最新」 */
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

  /** ✅ 体重系列：欠測日は null */
  const weightSeriesForChart = useMemo(() => {
    const f = new Date(activeRangeYmd.from + "T00:00:00");
    const t = new Date(activeRangeYmd.to + "T23:59:59");
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
  }, [dailyWeightMap, activeRangeYmd.from, activeRangeYmd.to]);

  /** 日別実食カロリー */
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

  // グラフ描画
  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      if (!groupChartRef.current || !dailyChartRef.current || !weightChartRef.current)
        return;
      if (rows.length === 0 && weights.length === 0) return;

      await ensureChartsReady();
      if (cancelled) return;

      const google = window.google;

      // グラフ1：0→200、超えたら100刻み切り上げ
      const maxGroup = Math.max(
        0,
        ...grouped15.map((g) => Number(g.totalNetKcal) || 0)
      );
      const vMaxGroup =
        maxGroup <= 200 ? 200 : (Math.floor(maxGroup / 100) + 1) * 100;

      // グラフ2：最小0、最大は400→超えたら100刻み切り上げ
      const maxDaily = Math.max(
        0,
        ...dailyKcalSeries.kcal.map((v) => Number(v) || 0)
      );
      const vMaxDaily =
        maxDaily <= 400 ? 400 : (Math.floor(maxDaily / 100) + 1) * 100;

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

        const sortedGroups = [...grouped15].sort((a, b) =>
          a.start.localeCompare(b.start)
        );

        const labels15 = sortedGroups.map((g, i) =>
          labelForMealGroupStart(
            g.start,
            i === 0 ? null : sortedGroups[i - 1].start
          )
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
            viewWindow: { min: 0, max: vMaxGroup },
            gridlines: { color: "#86f8f6" },
            minorGridlines: { color: "#d0f6ef", count: 4 },
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
          series: { 0: { type: "bars" }, 1: { type: "line" } },
          colors: ["#4facfe", "#7bd3ff"],
          vAxis: {
            title: "kcal",
            viewWindow: { min: 0, max: vMaxDaily },
            gridlines: { color: "#8cf4df" },
            minorGridlines: { color: "#d5f3f7", count: 4 },
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

        // ✅ 縦軸レンジ（要望）
        // - 基本：2.5〜6.0
        // - 2.5未満が1つでもあれば：0〜6.0
        // - 6.0超があれば：max = (最大値 + 1.0)
        const weightVals = weightSeriesForChart
          .map((d: any) => (d.weightKg == null ? null : Number(d.weightKg)))
          .filter((v: any) => typeof v === "number" && Number.isFinite(v)) as number[];

        const minW = weightVals.length ? Math.min(...weightVals) : NaN;
        const maxW = weightVals.length ? Math.max(...weightVals) : NaN;

        const vMinWeight = Number.isFinite(minW) && minW < 2.5 ? 0 : 2.5;

        let vMaxWeight = 5.0;
        if (Number.isFinite(maxW) && maxW > 5.0) {
          // “その数 + 1.0” をそのまま採用（見た目用に 0.1 刻みで切り上げ）
          vMaxWeight = Math.ceil((maxW + 1.0) * 10) / 10;
        }

        const weightTicks = buildTicks(vMinWeight, vMaxWeight);

        chart.draw(wData, {
          ...baseChartStyle,
          title: "体重",
          height: 360,
          legend: { position: "bottom" },
          interpolateNulls: true,
          vAxis: {
            title: "kg",
            viewWindow: { min: vMinWeight, max: vMaxWeight },
            gridlines: { color: "#cffff5" },
            minorGridlines: { color: "#1188b0", count: 3 },
          },
          vAxes: {
            0: {
              ticks: weightTicks,
            },
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

  /** プリセット切替（offsetはリセット） */
  const onPreset = (p: Preset) => {
    setPreset(p);
    setOffsetDays(0);
    if (p !== "custom") return;

    const today = jstYmd(new Date());
    setToDate(today);
    setFromDate(addDaysYmd(today, -6));
  };

  /** custom 適用 */
  const onCustomApply = () => {
    setPreset("custom");
    setOffsetDays(0);
  };

  /** < > ナビ（プリセット時のみ） */
  const canNav = preset !== "custom";
  const windowDays = canNav ? presetDays(preset) : 0;

  const onPrev = () => {
    if (!canNav) return;
    setOffsetDays((v) => v + windowDays);
  };

  const onNext = () => {
    if (!canNav) return;
    setOffsetDays((v) => Math.max(0, v - windowDays));
  };

  const rangeText = useMemo(() => {
    if (preset === "custom") {
      return `${fromDate} 〜 ${toDate}`;
    }
    return `${activeRangeYmd.from} 〜 ${activeRangeYmd.to}（${presetDays(preset)}日）`;
  }, [preset, fromDate, toDate, activeRangeYmd.from, activeRangeYmd.to]);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2>集計</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      <div className="summary-toolbar">
        <button
          className="summary-reload-btn"
          onClick={() =>
            load(activeRangeYmd.from, activeRangeYmd.to).catch((e) =>
              setMsg("ERROR: " + String(e?.message ?? e))
            )
          }
        >
          再読込
        </button>

        <div className="summary-range-box">
          <div className="summary-range-top">
            <span className="summary-range-label">集計範囲：</span>

            <div className="summary-nav">
              <button
                className="summary-nav-btn"
                onClick={onPrev}
                disabled={!canNav}
              >
                &lt;
              </button>
              <div className="summary-nav-text">{rangeText}</div>
              <button
                className="summary-nav-btn"
                onClick={onNext}
                disabled={!canNav || offsetDays === 0}
              >
                &gt;
              </button>
            </div>
          </div>

          <div className="summary-range-buttons">
            <button
              className={`summary-range-btn ${preset === "3" ? "active" : ""}`}
              onClick={() => onPreset("3")}
            >
              直近3日
            </button>

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
              className={`summary-range-btn ${preset === "custom" ? "active" : ""}`}
              onClick={() => onPreset("custom")}
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

      <h3 style={{ marginTop: 16 }}>15分ルール：1回分の実食kcal</h3>
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

      <h3 style={{ marginTop: 16 }}>日別 実食カロリー＆7日平均</h3>
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

      <h3 style={{ marginTop: 16 }}>体重の推移</h3>
      <div
        ref={weightChartRef}
        style={{
          width: "100%",
          minHeight: 360,
          border: "1px solid #dddddd",
          borderRadius: 16,
          overflow: "hidden",
        }}
      />
    </main>
  );
}
