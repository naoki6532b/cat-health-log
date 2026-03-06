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

type Preset = "3" | "7" | "30" | "90" | "custom";

type RangeYmd = {
  from: string;
  to: string;
};

declare global {
  interface Window {
    google?: any;
  }
}

/** Google Charts is loaded only once and reused */
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

// Create YYYY-MM-DD in JST
function jstYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Shift YYYY-MM-DD by delta days in JST
function addDaysYmd(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return jstYmd(d);
}

// Create YYYY-MM-DD in JST from ISO datetime
function toDateKey(dtIso: string) {
  const d = new Date(dtIso);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  return { y, m, d };
}

/** Date object for Google Charts */
function ymdToChartDate(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return new Date(y, m - 1, d);
}

function daysBetweenYmd(from: string, to: string) {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * Build date ticks according to display span
 * - short: daily
 * - middle: every few days
 * - long: monthly
 */
function buildDateTicks(from: string, to: string): Date[] {
  const span = daysBetweenYmd(from, to);

  if (span > 120) {
    const ticks: Date[] = [];
    const fromObj = parseYmd(from);
    const toObj = parseYmd(to);

    ticks.push(ymdToChartDate(from));

    let y = fromObj.y;
    let m = fromObj.m;

    while (true) {
      const firstOfMonth = new Date(y, m - 1, 1);
      const tickYmd = jstYmd(
        new Date(
          firstOfMonth.getFullYear(),
          firstOfMonth.getMonth(),
          firstOfMonth.getDate()
        )
      );

      if (tickYmd > from && tickYmd < to) {
        ticks.push(firstOfMonth);
      }

      m++;
      if (m > 12) {
        y++;
        m = 1;
      }

      if (y > toObj.y || (y === toObj.y && m > toObj.m + 1)) {
        break;
      }
      if (ticks.length > 30) break;
    }

    if (from !== to) {
      ticks.push(ymdToChartDate(to));
    }

    return ticks;
  }

  let step = 1;
  if (span <= 10) step = 1;
  else if (span <= 20) step = 2;
  else if (span <= 45) step = 5;
  else if (span <= 90) step = 7;
  else step = 14;

  const ticks: Date[] = [];
  let cur = from;
  let guard = 0;

  while (cur <= to) {
    ticks.push(ymdToChartDate(cur));
    cur = addDaysYmd(cur, step);
    guard++;
    if (guard > 100) break;
  }

  const last = ticks[ticks.length - 1];
  const lastYmd = last ? jstYmd(last) : "";
  if (lastYmd !== to) {
    ticks.push(ymdToChartDate(to));
  }

  return ticks;
}

function getDateAxisFormat(from: string, to: string) {
  const span = daysBetweenYmd(from, to);
  if (span > 120) return "yyyy/M";
  return "M/d";
}

/**
 * Time zone label
 * morning: 5-11, noon: 12-16, night: 17-23, late night: 0-4
 */
function dayPartLabel(hour: number) {
  if (hour >= 5 && hour <= 11) return "朝";
  if (hour >= 12 && hour <= 16) return "昼";
  if (hour >= 17 && hour <= 23) return "夜";
  return "深夜";
}

/** Extract JST year/month/day/hour stably */
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
 * Label for the 15-minute grouped meal chart
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

  return `${cur.m}/${cur.day}${part}`;
}

/** Reduce label density for 15-minute grouped chart */
function mealGroupShowTextEvery(count: number) {
  if (count <= 12) return 1;
  if (count <= 24) return 2;
  if (count <= 36) return 3;
  if (count <= 48) return 4;
  if (count <= 72) return 6;
  return 8;
}

/** Moving average over last N observations */
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
 * Fallback net calculation if API does not return net / leftover
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

/** Build continuous date series */
function buildDateSeriesYmd(fromYmd: string, toYmd: string) {
  const out: string[] = [];
  let cur = fromYmd;
  let guard = 0;

  while (cur <= toYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
    guard++;
    if (guard > 3660) break;
  }

  return out;
}

function presetDays(p: Preset) {
  if (p === "3") return 3;
  if (p === "7") return 7;
  if (p === "30") return 30;
  if (p === "90") return 90;
  return 7;
}

function buildWeightTicks(min: number, max: number) {
  const span = max - min;
  const step = span > 12 ? 1 : 0.05;
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

/** Display range dedicated to weight chart */
function getWeightRangeYmd(preset: Preset, mealRange: RangeYmd): RangeYmd {
  if (preset === "custom") {
    return mealRange;
  }

  if (preset === "30" || preset === "90") {
    return {
      from: addDaysYmd(mealRange.to, -364),
      to: mealRange.to,
    };
  }

  return {
    from: addDaysYmd(mealRange.to, -29),
    to: mealRange.to,
  };
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [msg, setMsg] = useState("");

  const [preset, setPreset] = useState<Preset>("7");
  const [offsetDays, setOffsetDays] = useState<number>(0);

  const [fromDate, setFromDate] = useState<string>(() => {
    const today = jstYmd(new Date());
    return addDaysYmd(today, -6);
  });
  const [toDate, setToDate] = useState<string>(() => jstYmd(new Date()));

  const groupChartRef = useRef<HTMLDivElement | null>(null);
  const dailyChartRef = useRef<HTMLDivElement | null>(null);
  const weightChartRef = useRef<HTMLDivElement | null>(null);

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

  const weightRangeYmd = useMemo(() => {
    return getWeightRangeYmd(preset, {
      from: activeRangeYmd.from,
      to: activeRangeYmd.to,
    });
  }, [preset, activeRangeYmd.from, activeRangeYmd.to]);

  const load = async (
    mealFrom: string,
    mealTo: string,
    weightFrom: string,
    weightTo: string
  ) => {
    setMsg("");

    const mealsUrl = `/api/summary/meals?from=${mealFrom}&to=${mealTo}`;
    const weightsUrl = `/api/weights?from=${weightFrom}&to=${weightTo}`;

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

  useEffect(() => {
    load(
      activeRangeYmd.from,
      activeRangeYmd.to,
      weightRangeYmd.from,
      weightRangeYmd.to
    ).catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
  }, [
    activeRangeYmd.from,
    activeRangeYmd.to,
    weightRangeYmd.from,
    weightRangeYmd.to,
  ]);

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

  const weightSeriesForChart = useMemo(() => {
    const dates = buildDateSeriesYmd(weightRangeYmd.from, weightRangeYmd.to);

    const base = dates.map((date) => {
      const w = dailyWeightMap.get(date)?.weightKg ?? null;
      return { date, weightKg: w };
    });

    const avg7 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      7
    );

    return base.map((x, i) => ({
      ...x,
      weightAvg7: x.weightKg == null ? null : avg7[i],
    }));
  }, [dailyWeightMap, weightRangeYmd.from, weightRangeYmd.to]);

  const dailyKcalSeries = useMemo(() => {
    const allDates = buildDateSeriesYmd(activeRangeYmd.from, activeRangeYmd.to);

    const map = new Map<string, number>();
    for (const r of rows) {
      const d = toDateKey(r.dt);
      const cur = map.get(d) ?? 0;
      const { net_kcal } = calcNet(r);
      map.set(d, cur + net_kcal);
    }

    const kcal = allDates.map((date) => {
      const v = map.get(date);
      return v == null ? null : Number(v.toFixed(1));
    });

    const avg7 = movingAvgLastNObservations(kcal, 7).map((v) =>
      v == null ? null : Number(v.toFixed(1))
    );

    return { dates: allDates, kcal, avg7 };
  }, [rows, activeRangeYmd.from, activeRangeYmd.to]);

  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      if (
        !groupChartRef.current ||
        !dailyChartRef.current ||
        !weightChartRef.current
      ) {
        return;
      }

      if (rows.length === 0 && weights.length === 0) return;

      await ensureChartsReady();
      if (cancelled) return;

      const google = window.google;

      const maxGroup = Math.max(
        0,
        ...grouped15.map((g) => Number(g.totalNetKcal) || 0)
      );
      const vMaxGroup =
        maxGroup <= 200 ? 200 : (Math.floor(maxGroup / 100) + 1) * 100;

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
      } as const;

      // 15分ルール
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
          hAxis: {
            slantedText: false,
            showTextEvery: mealGroupShowTextEvery(sortedGroups.length),
          },
          vAxis: {
            title: "kcal",
            viewWindow: { min: 0, max: vMaxGroup },
            gridlines: { color: "#86f8f6" },
            minorGridlines: { color: "#d0f6ef", count: 4 },
          },
        });
      }

      // 日別 実食kcal
      {
        const dData = new google.visualization.DataTable();
        dData.addColumn("date", "日付");
        dData.addColumn("number", "実食kcal");
        dData.addColumn({ type: "number", role: "annotation" });
        dData.addColumn("number", "7日平均");
        dData.addColumn({ type: "number", role: "annotation" });

        dData.addRows(
          dailyKcalSeries.dates.map((ymd, i) => {
            const v = dailyKcalSeries.kcal[i];
            const a = dailyKcalSeries.avg7[i];
            return [
              ymdToChartDate(ymd),
              v == null ? null : v,
              v == null ? null : v,
              a == null ? null : a,
              a == null ? null : a,
            ];
          })
        );

        const chart = new google.visualization.ComboChart(dailyChartRef.current);
        chart.draw(dData, {
          ...baseChartStyle,
          title: "日別 実食カロリー（棒）＋ 7日平均（線）",
          height: 360,
          legend: { position: "bottom" },
          seriesType: "bars",
          series: { 0: { type: "bars" }, 1: { type: "line" } },
          colors: ["#4facfe", "#7bd3ff"],
          hAxis: {
            format: getDateAxisFormat(activeRangeYmd.from, activeRangeYmd.to),
            ticks: buildDateTicks(activeRangeYmd.from, activeRangeYmd.to),
            slantedText: false,
          },
          vAxis: {
            title: "kcal",
            viewWindow: { min: 0, max: vMaxDaily },
            gridlines: { color: "#8cf4df" },
            minorGridlines: { color: "#d5f3f7", count: 4 },
          },
        });
      }

      // 体重
      {
        const wData = new google.visualization.DataTable();
        wData.addColumn("date", "日付");
        wData.addColumn("number", "体重(kg)");
        wData.addColumn({ type: "number", role: "annotation" });
        wData.addColumn("number", "体重(7回平均)");
        wData.addColumn({ type: "number", role: "annotation" });

        wData.addRows(
          weightSeriesForChart.map((d) => [
            ymdToChartDate(d.date),
            d.weightKg == null ? null : Number(Number(d.weightKg).toFixed(2)),
            d.weightKg == null ? null : Number(Number(d.weightKg).toFixed(2)),
            d.weightAvg7 == null ? null : Number(Number(d.weightAvg7).toFixed(2)),
            d.weightAvg7 == null ? null : Number(Number(d.weightAvg7).toFixed(2)),
          ])
        );

        const chart = new google.visualization.LineChart(weightChartRef.current);

        const weightVals = weightSeriesForChart
          .map((d) => (d.weightKg == null ? null : Number(d.weightKg)))
          .filter(
            (v): v is number => typeof v === "number" && Number.isFinite(v)
          );

        const minW = weightVals.length ? Math.min(...weightVals) : NaN;
        const maxW = weightVals.length ? Math.max(...weightVals) : NaN;

        const vMinWeight = Number.isFinite(minW) && minW < 2.5 ? 0 : 2.5;

        let vMaxWeight = 5.0;
        if (Number.isFinite(maxW) && maxW > 5.0) {
          vMaxWeight = Math.ceil((maxW + 1.0) * 10) / 10;
        }

        const weightTicks = buildWeightTicks(vMinWeight, vMaxWeight);

        chart.draw(wData, {
          ...baseChartStyle,
          title: "体重",
          height: 360,
          legend: { position: "bottom" },
          interpolateNulls: true,
          hAxis: {
            format: getDateAxisFormat(weightRangeYmd.from, weightRangeYmd.to),
            ticks: buildDateTicks(weightRangeYmd.from, weightRangeYmd.to),
            slantedText: false,
          },
          vAxis: {
            title: "kg",
            viewWindow: { min: vMinWeight, max: vMaxWeight },
            gridlines: { color: "#cffff5" },
            minorGridlines: { color: "#1188b0", count: 3 },
            ticks: weightTicks,
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
  }, [
    rows,
    weights,
    grouped15,
    weightSeriesForChart,
    dailyKcalSeries,
    activeRangeYmd.from,
    activeRangeYmd.to,
    weightRangeYmd.from,
    weightRangeYmd.to,
  ]);

  const onPreset = (p: Preset) => {
    setPreset(p);
    setOffsetDays(0);

    if (p !== "custom") return;

    const today = jstYmd(new Date());
    setToDate(today);
    setFromDate(addDaysYmd(today, -6));
  };

  const onCustomApply = () => {
    setPreset("custom");
    setOffsetDays(0);
  };

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
    return `${activeRangeYmd.from} 〜 ${activeRangeYmd.to}（${presetDays(
      preset
    )}日）`;
  }, [preset, fromDate, toDate, activeRangeYmd.from, activeRangeYmd.to]);

  const weightRangeText = useMemo(() => {
    return `${weightRangeYmd.from} 〜 ${weightRangeYmd.to}`;
  }, [weightRangeYmd.from, weightRangeYmd.to]);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2>集計</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      <div className="summary-toolbar">
        <button
          className="summary-reload-btn"
          onClick={() =>
            load(
              activeRangeYmd.from,
              activeRangeYmd.to,
              weightRangeYmd.from,
              weightRangeYmd.to
            ).catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))
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
              className={`summary-range-btn ${
                preset === "custom" ? "active" : ""
              }`}
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
        給餌：{rows.length} 件 / 体重：{weights.length} 件（体重グラフ表示範囲で取得済み）
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

      <h3 style={{ marginTop: 16 }}>体重の推移</h3>
      <div style={{ marginTop: 4, color: "#666", fontSize: 14 }}>
        体重グラフ表示範囲：{weightRangeText}
      </div>
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
    </main>
  );
}