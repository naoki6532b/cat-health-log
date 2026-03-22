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

type Preset =
  | "3"
  | "7"
  | "30"
  | "90"
  | "180"
  | "365"
  | "548"
  | "custom";

type WeightDisplayMode =
  | "actual"
  | "ma3"
  | "ma5"
  | "ma7"
  | "ma10"
  | "ma14";

type WeightRangePreset =
  | "1m"
  | "2m"
  | "3m"
  | "6m"
  | "12m"
  | "18m"
  | "36m"
  | "48m"
  | "60m"
  | "all";

type RangeYmd = {
  from: string;
  to: string;
};

type GoogleAxisTick = Date | { v: Date; f: string };

type GoogleChartsType = {
  charts: {
    load: (version: string, settings: { packages: string[] }) => void;
    setOnLoadCallback: (callback: () => void) => void;
  };
  visualization: {
    DataTable: new () => {
      addColumn: (
        type: string | { type: string; role: string },
        label?: string
      ) => void;
      addRows: (rows: unknown[][]) => void;
    };
    ColumnChart: new (element: Element) => {
      draw: (data: unknown, options: unknown) => void;
    };
    ComboChart: new (element: Element) => {
      draw: (data: unknown, options: unknown) => void;
    };
    LineChart: new (element: Element) => {
      draw: (data: unknown, options: unknown) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleChartsType;
  }
}

let chartsReadyPromise: Promise<void> | null = null;

function loadGoogleChartsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.charts) {
      resolve();
      return;
    }

    const existing = document.querySelector(
      'script[data-google-charts="1"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.google?.charts) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Charts")),
        { once: true }
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

    const googleObj = window.google;
    if (!googleObj) {
      throw new Error("Google Charts failed to initialize");
    }

    googleObj.charts.load("current", { packages: ["corechart"] });
    await new Promise<void>((resolve) =>
      googleObj.charts.setOnLoadCallback(() => resolve())
    );
  })();

  return chartsReadyPromise;
}

function jstYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return jstYmd(d);
}

function addMonthsYmd(ymd: string, deltaMonths: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCMonth(base.getUTCMonth() + deltaMonths);
  return jstYmd(base);
}

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

function ymdToChartDate(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return new Date(y, m - 1, d);
}

function daysBetweenYmd(from: string, to: string) {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

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
      if (ticks.length > 40) break;
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
    if (guard > 300) break;
  }

  const last = ticks[ticks.length - 1];
  const lastYmd = last ? jstYmd(last) : "";
  if (lastYmd !== to) {
    ticks.push(ymdToChartDate(to));
  }

  return ticks;
}

/** 体重グラフ専用: 下メモリが粗くなりすぎないように通常より細かめ */
function buildWeightDateTicks(from: string, to: string): Date[] {
  const span = daysBetweenYmd(from, to);

  let step = 1;
  if (span <= 31) step = 3;
  else if (span <= 62) step = 5;
  else if (span <= 93) step = 7;
  else if (span <= 186) step = 10;
  else if (span <= 366) step = 14;
  else if (span <= 548) step = 21;
  else if (span <= 1096) step = 30;
  else if (span <= 1826) step = 45;
  else step = 60;

  const ticks: Date[] = [];
  let cur = from;
  let guard = 0;

  while (cur <= to) {
    ticks.push(ymdToChartDate(cur));
    cur = addDaysYmd(cur, step);
    guard++;
    if (guard > 600) break;
  }

  const firstYmd = ticks[0] ? jstYmd(ticks[0]) : "";
  const lastYmd = ticks[ticks.length - 1] ? jstYmd(ticks[ticks.length - 1]) : "";

  if (firstYmd !== from) {
    ticks.unshift(ymdToChartDate(from));
  }

  if (lastYmd !== to) {
    ticks.push(ymdToChartDate(to));
  }

  return ticks;
}

function dayPartLabel(hour: number) {
  if (hour >= 5 && hour <= 11) return "朝";
  if (hour >= 12 && hour <= 16) return "昼";
  if (hour >= 17 && hour <= 23) return "夜";
  return "深夜";
}

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

function labelForMealGroupStart(iso: string, prevIso: string | null) {
  const cur = getJstParts(iso);
  const part = dayPartLabel(cur.hour);

  if (!prevIso) {
    return `${cur.m}/${cur.day}${part}`;
  }

  const prev = getJstParts(prevIso);

  if (cur.y !== prev.y) {
    return `${cur.y}/${cur.m}/${cur.day}${part}`;
  }

  if (cur.m !== prev.m) {
    return `${cur.m}/${cur.day}${part}`;
  }

  if (cur.day !== prev.day) {
    return `${cur.day}${part}`;
  }

  return part;
}

function mealGroupShowTextEvery(count: number) {
  if (count <= 12) return 1;
  if (count <= 24) return 2;
  if (count <= 36) return 3;
  if (count <= 48) return 4;
  if (count <= 72) return 6;
  return 8;
}

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

function calcNet(m: MealRow) {
  const grams = Number(m.grams ?? 0);
  const kcal = Number(m.kcal ?? 0);

  const leftover_g = Number(m.leftover_g ?? 0);
  const snap = Number(m.kcal_per_g_snapshot ?? Number.NaN);

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

function buildDateSeriesYmd(fromYmd: string, toYmd: string) {
  const out: string[] = [];
  let cur = fromYmd;
  let guard = 0;

  while (cur <= toYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
    guard++;
    if (guard > 20000) break;
  }

  return out;
}

function presetDays(p: Preset) {
  if (p === "3") return 3;
  if (p === "7") return 7;
  if (p === "30") return 30;
  if (p === "90") return 90;
  if (p === "180") return 180;
  if (p === "365") return 365;
  if (p === "548") return 548;
  return 7;
}

function getMealPresetLabel(p: Preset) {
  if (p === "3") return "直近3日";
  if (p === "7") return "直近7日";
  if (p === "30") return "直近30日";
  if (p === "90") return "直近90日";
  if (p === "180") return "直近180日";
  if (p === "365") return "1年";
  if (p === "548") return "1.5年";
  return "期間指定";
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

function getWeightModeLabel(mode: WeightDisplayMode) {
  if (mode === "actual") return "実測値";
  if (mode === "ma3") return "3MA";
  if (mode === "ma5") return "5MA";
  if (mode === "ma7") return "7MA";
  if (mode === "ma10") return "10MA";
  return "14MA";
}

function getWeightModeColor(mode: WeightDisplayMode) {
  if (mode === "actual") return "#2563eb";
  if (mode === "ma3") return "#f97316";
  if (mode === "ma5") return "#16a34a";
  if (mode === "ma7") return "#dc2626";
  if (mode === "ma10") return "#0f766e";
  return "#7c3aed";
}

function getWeightRangePresetLabel(p: WeightRangePreset) {
  if (p === "1m") return "1か月";
  if (p === "2m") return "2か月";
  if (p === "3m") return "3か月";
  if (p === "6m") return "6か月";
  if (p === "12m") return "12か月";
  if (p === "18m") return "18か月";
  if (p === "36m") return "36か月";
  if (p === "48m") return "48か月";
  if (p === "60m") return "60か月";
  return "すべて";
}

function getWeightRequestRangeYmdByPreset(preset: WeightRangePreset): RangeYmd {
  const today = jstYmd(new Date());

  if (preset === "all") {
    return { from: "2000-01-01", to: today };
  }

  const months =
    preset === "1m"
      ? 1
      : preset === "2m"
        ? 2
        : preset === "3m"
          ? 3
          : preset === "6m"
            ? 6
            : preset === "12m"
              ? 12
              : preset === "18m"
                ? 18
                : preset === "36m"
                  ? 36
                  : preset === "48m"
                    ? 48
                    : 60;

  return {
    from: addMonthsYmd(today, -months),
    to: today,
  };
}

function formatCompactDateLabel(ymd: string, prevYmd: string | null) {
  const cur = parseYmd(ymd);

  if (!prevYmd) {
    return `${cur.m}/${cur.d}`;
  }

  const prev = parseYmd(prevYmd);

  if (cur.y !== prev.y) {
    return `${cur.y}/${cur.m}/${cur.d}`;
  }

  if (cur.m !== prev.m) {
    return `${cur.m}/${cur.d}`;
  }

  return `${cur.d}`;
}

function buildCompactDateAxisTicks(from: string, to: string): GoogleAxisTick[] {
  const baseTicks = buildDateTicks(from, to);

  return baseTicks.map((tick, i) => {
    const ymd = jstYmd(tick);
    const prevYmd = i === 0 ? null : jstYmd(baseTicks[i - 1]);

    return {
      v: tick,
      f: formatCompactDateLabel(ymd, prevYmd),
    };
  });
}

function buildCompactWeightDateAxisTicks(
  from: string,
  to: string
): GoogleAxisTick[] {
  const baseTicks = buildWeightDateTicks(from, to);

  return baseTicks.map((tick, i) => {
    const ymd = jstYmd(tick);
    const prevYmd = i === 0 ? null : jstYmd(baseTicks[i - 1]);

    return {
      v: tick,
      f: formatCompactDateLabel(ymd, prevYmd),
    };
  });
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [msg, setMsg] = useState("");

  const [preset, setPreset] = useState<Preset>("7");
  const [offsetDays, setOffsetDays] = useState<number>(0);

  const [weightRangePreset, setWeightRangePreset] =
    useState<WeightRangePreset>("1m");

  const [weightDisplayMode, setWeightDisplayMode] =
    useState<WeightDisplayMode>("actual");

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

  const mealRangeDays = useMemo(() => {
    return daysBetweenYmd(activeRangeYmd.from, activeRangeYmd.to);
  }, [activeRangeYmd.from, activeRangeYmd.to]);

  // 30日以上はカロリー系ラベル非表示
  const showMealDataLabels = useMemo(() => {
    return mealRangeDays < 30;
  }, [mealRangeDays]);

  const weightRequestRangeYmd = useMemo(() => {
    return getWeightRequestRangeYmdByPreset(weightRangePreset);
  }, [weightRangePreset]);

  // 12か月以上は体重ラベル非表示
  const showWeightDataLabels = useMemo(() => {
    return (
      weightRangePreset === "1m" ||
      weightRangePreset === "2m" ||
      weightRangePreset === "3m" ||
      weightRangePreset === "6m"
    );
  }, [weightRangePreset]);

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
      weightRequestRangeYmd.from,
      weightRequestRangeYmd.to
    ).catch((e: unknown) =>
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
    );
  }, [
    activeRangeYmd.from,
    activeRangeYmd.to,
    weightRequestRangeYmd.from,
    weightRequestRangeYmd.to,
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

      // 同日の複数記録は最後の1件を採用
      map.set(d, { date: d, weightKg: kg, dt: w.dt });
    }

    return map;
  }, [weights]);

  const firstWeightDate = useMemo(() => {
    const keys = Array.from(dailyWeightMap.keys()).sort();
    return keys[0] ?? jstYmd(new Date());
  }, [dailyWeightMap]);

  const weightChartRangeYmd = useMemo(() => {
    if (weightRangePreset === "all") {
      return {
        from: firstWeightDate,
        to: jstYmd(new Date()),
      };
    }

    return weightRequestRangeYmd;
  }, [weightRangePreset, weightRequestRangeYmd, firstWeightDate]);

  const weightSeriesForChart = useMemo(() => {
    const dates = buildDateSeriesYmd(
      weightChartRangeYmd.from,
      weightChartRangeYmd.to
    );

    const base = dates.map((date) => {
      const w = dailyWeightMap.get(date)?.weightKg ?? null;
      return { date, weightKg: w };
    });

    const avg3 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      3
    );
    const avg5 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      5
    );
    const avg7 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      7
    );
    const avg10 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      10
    );
    const avg14 = movingAvgLastNObservations(
      base.map((x) => x.weightKg),
      14
    );

    return base.map((x, i) => ({
      ...x,
      weightAvg3: x.weightKg == null ? null : avg3[i],
      weightAvg5: x.weightKg == null ? null : avg5[i],
      weightAvg7: x.weightKg == null ? null : avg7[i],
      weightAvg10: x.weightKg == null ? null : avg10[i],
      weightAvg14: x.weightKg == null ? null : avg14[i],
    }));
  }, [dailyWeightMap, weightChartRangeYmd.from, weightChartRangeYmd.to]);

  const activeWeightSeries = useMemo(() => {
    return weightSeriesForChart.map((d) => {
      let value: number | null = d.weightKg;

      if (weightDisplayMode === "ma3") value = d.weightAvg3;
      else if (weightDisplayMode === "ma5") value = d.weightAvg5;
      else if (weightDisplayMode === "ma7") value = d.weightAvg7;
      else if (weightDisplayMode === "ma10") value = d.weightAvg10;
      else if (weightDisplayMode === "ma14") value = d.weightAvg14;

      return {
        date: d.date,
        value,
      };
    });
  }, [weightSeriesForChart, weightDisplayMode]);

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

      const googleObj = window.google;
      if (!googleObj) return;

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
        const gData = new googleObj.visualization.DataTable();
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
            return [labels15[i], v, showMealDataLabels ? v : null];
          })
        );

        const chart = new googleObj.visualization.ColumnChart(
          groupChartRef.current
        );

        chart.draw(gData, {
          ...baseChartStyle,
          title: "15分ルール：1回分の実食kcal（朝/昼/夜/深夜）",
          height: 360,
          legend: { position: "none" },
          colors: ["#6ec6ff"],
          hAxis: {
            slantedText: false,
            showTextEvery: mealGroupShowTextEvery(sortedGroups.length),
            textStyle: { fontSize: 10 },
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
        const dData = new googleObj.visualization.DataTable();
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
              showMealDataLabels && v != null ? v : null,
              a == null ? null : a,
              showMealDataLabels && a != null ? a : null,
            ];
          })
        );

        const chart = new googleObj.visualization.ComboChart(
          dailyChartRef.current
        );

        chart.draw(dData, {
          ...baseChartStyle,
          title: "日別 実食カロリー（棒）＋ 7日平均（線）",
          height: 360,
          legend: { position: "bottom" },
          seriesType: "bars",
          series: { 0: { type: "bars" }, 1: { type: "line" } },
          colors: ["#4facfe", "#7bd3ff"],
          hAxis: {
            ticks: buildCompactDateAxisTicks(
              activeRangeYmd.from,
              activeRangeYmd.to
            ),
            slantedText: false,
            textStyle: { fontSize: 10 },
            maxAlternation: 1,
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
        const wData = new googleObj.visualization.DataTable();
        wData.addColumn("date", "日付");
        wData.addColumn("number", getWeightModeLabel(weightDisplayMode));
        wData.addColumn({ type: "number", role: "annotation" });

        wData.addRows(
          activeWeightSeries.map((d) => {
            const value =
              d.value == null ? null : Number(Number(d.value).toFixed(2));

            return [
              ymdToChartDate(d.date),
              value,
              showWeightDataLabels && value != null ? value : null,
            ];
          })
        );

        const chart = new googleObj.visualization.LineChart(
          weightChartRef.current
        );

        const weightVals = activeWeightSeries
          .map((d) => (d.value == null ? null : Number(d.value)))
          .filter(
            (v): v is number => typeof v === "number" && Number.isFinite(v)
          );

        const minW = weightVals.length ? Math.min(...weightVals) : Number.NaN;
        const maxW = weightVals.length ? Math.max(...weightVals) : Number.NaN;

        const vMinWeight = Number.isFinite(minW) && minW < 2.5 ? 0 : 2.5;

        let vMaxWeight = 5.0;
        if (Number.isFinite(maxW) && maxW > 5.0) {
          vMaxWeight = Math.ceil((maxW + 1.0) * 10) / 10;
        }

        const weightTicks = buildWeightTicks(vMinWeight, vMaxWeight);

        chart.draw(wData, {
          ...baseChartStyle,
          title: `体重（${getWeightModeLabel(weightDisplayMode)}）`,
          height: 380,
          legend: { position: "none" },
          interpolateNulls: true,
          colors: [getWeightModeColor(weightDisplayMode)],
          pointSize: 4,
          lineWidth: 2,
          chartArea: {
            ...baseChartStyle.chartArea,
            bottom: 62,
            height: "66%",
          },
          hAxis: {
            ticks: buildCompactWeightDateAxisTicks(
              weightChartRangeYmd.from,
              weightChartRangeYmd.to
            ),
            slantedText: false,
            textStyle: { fontSize: 9 },
            maxAlternation: 1,
            gridlines: { color: "#e7e7e7" },
            minorGridlines: { color: "#f2f2f2" },
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

    draw().catch((e: unknown) =>
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
    );

    const onResize = () => {
      draw().catch(() => {});
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [
    rows,
    weights,
    grouped15,
    activeWeightSeries,
    weightDisplayMode,
    dailyKcalSeries,
    activeRangeYmd.from,
    activeRangeYmd.to,
    weightChartRangeYmd.from,
    weightChartRangeYmd.to,
    showMealDataLabels,
    showWeightDataLabels,
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

    return `${activeRangeYmd.from} 〜 ${activeRangeYmd.to}（${getMealPresetLabel(
      preset
    )}）`;
  }, [preset, fromDate, toDate, activeRangeYmd.from, activeRangeYmd.to]);

  const weightRangeText = useMemo(() => {
    return `${weightChartRangeYmd.from} 〜 ${weightChartRangeYmd.to}`;
  }, [weightChartRangeYmd.from, weightChartRangeYmd.to]);

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
              weightRequestRangeYmd.from,
              weightRequestRangeYmd.to
            ).catch((e: unknown) =>
              setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
            )
          }
        >
          再読込
        </button>

        <div className="summary-range-box">
          <div className="summary-range-top">
            <span className="summary-range-label">給餌集計範囲：</span>

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
                preset === "180" ? "active" : ""
              }`}
              onClick={() => onPreset("180")}
            >
              直近180日
            </button>

            <button
              className={`summary-range-btn ${
                preset === "365" ? "active" : ""
              }`}
              onClick={() => onPreset("365")}
            >
              1年
            </button>

            <button
              className={`summary-range-btn ${
                preset === "548" ? "active" : ""
              }`}
              onClick={() => onPreset("548")}
            >
              1.5年
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
        給餌：{rows.length} 件 / 体重：{weights.length} 件（体重は独立期間で取得）
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

      <div style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
        体重グラフ集計期間
      </div>

      <div
        style={{
          marginTop: 8,
          marginBottom: 8,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {(
          [
            "1m",
            "2m",
            "3m",
            "6m",
            "12m",
            "18m",
            "36m",
            "48m",
            "60m",
            "all",
          ] as WeightRangePreset[]
        ).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setWeightRangePreset(p)}
            style={{
              padding: "8px 14px",
              borderRadius: 9999,
              border: "1px solid #d4d4d8",
              background: weightRangePreset === p ? "#18181b" : "#fff",
              color: weightRangePreset === p ? "#fff" : "#18181b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {getWeightRangePresetLabel(p)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
        表示系列
      </div>

      <div
        style={{
          marginTop: 8,
          marginBottom: 8,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setWeightDisplayMode("actual")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: "1px solid #d4d4d8",
            background: weightDisplayMode === "actual" ? "#18181b" : "#fff",
            color: weightDisplayMode === "actual" ? "#fff" : "#18181b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          実測値
        </button>

        <button
          type="button"
          onClick={() => setWeightDisplayMode("ma3")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: "1px solid #d4d4d8",
            background: weightDisplayMode === "ma3" ? "#18181b" : "#fff",
            color: weightDisplayMode === "ma3" ? "#fff" : "#18181b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          3MA
        </button>

        <button
          type="button"
          onClick={() => setWeightDisplayMode("ma5")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: "1px solid #d4d4d8",
            background: weightDisplayMode === "ma5" ? "#18181b" : "#fff",
            color: weightDisplayMode === "ma5" ? "#fff" : "#18181b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          5MA
        </button>

        <button
          type="button"
          onClick={() => setWeightDisplayMode("ma7")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: "1px solid #d4d4d8",
            background: weightDisplayMode === "ma7" ? "#18181b" : "#fff",
            color: weightDisplayMode === "ma7" ? "#fff" : "#18181b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          7MA
        </button>

        <button
          type="button"
          onClick={() => setWeightDisplayMode("ma10")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: "1px solid #d4d4d8",
            background: weightDisplayMode === "ma10" ? "#18181b" : "#fff",
            color: weightDisplayMode === "ma10" ? "#fff" : "#18181b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          10MA
        </button>

        <button
          type="button"
          onClick={() => setWeightDisplayMode("ma14")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: "1px solid #d4d4d8",
            background: weightDisplayMode === "ma14" ? "#18181b" : "#fff",
            color: weightDisplayMode === "ma14" ? "#fff" : "#18181b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          14MA
        </button>
      </div>

      <div style={{ marginTop: 4, color: "#666", fontSize: 14 }}>
        体重グラフ表示範囲：{weightRangeText}
      </div>
      <div style={{ marginTop: 4, color: "#666", fontSize: 14 }}>
        表示系列：{getWeightModeLabel(weightDisplayMode)}
      </div>

      <div
        ref={weightChartRef}
        style={{
          width: "100%",
          minHeight: 380,
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