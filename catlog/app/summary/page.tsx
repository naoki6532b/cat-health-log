"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { apiFetch } from "@/lib/api";

type MealRow = {
  dt: string;
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
  dt: string;
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

type WeightSmoothKind = "actual" | "ema" | "ma";
type WeightSmoothPeriod = 3 | 7 | 14;

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

const FIXED_Y_AXIS_WIDTH = 124;
const TOOLTIP_FONT_SIZE = 10;
const CHART_PLOT_LEFT_PX = 8;
const CHART_PLOT_WIDTH_RATIO = 0.92;

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function isYmdInRange(ymd: string, from: string, to: string) {
  return ymd >= from && ymd <= to;
}

function niceDayStep(rawStep: number) {
  const steps = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180];
  for (const step of steps) {
    if (rawStep <= step) return step;
  }
  return Math.ceil(rawStep / 30) * 30;
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

function buildDateTicksByWidth(
  from: string,
  to: string,
  chartWidthPx: number
): Date[] {
  const totalDays = daysBetweenYmd(from, to);
  const desiredTicks = clamp(Math.floor(chartWidthPx / 110), 2, 180);
  const step = niceDayStep(Math.ceil(totalDays / desiredTicks));

  const ticks: Date[] = [];
  let cur = from;
  let guard = 0;

  while (cur <= to) {
    ticks.push(ymdToChartDate(cur));
    cur = addDaysYmd(cur, step);
    guard++;
    if (guard > 5000) break;
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

function buildCompactDateAxisTicksByWidth(
  from: string,
  to: string,
  chartWidthPx: number
): GoogleAxisTick[] {
  const baseTicks = buildDateTicksByWidth(from, to, chartWidthPx);

  return baseTicks.map((tick, i) => {
    const ymd = jstYmd(tick);
    const prevYmd = i === 0 ? null : jstYmd(baseTicks[i - 1]);

    return {
      v: tick,
      f: formatCompactDateLabel(ymd, prevYmd),
    };
  });
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

function exponentialAvgLastNObservations(
  values: Array<number | null>,
  n: number
): Array<number | null> {
  const out: Array<number | null> = [];
  const alpha = 2 / (n + 1);
  let prevEma: number | null = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];

    if (typeof v === "number" && Number.isFinite(v)) {
      if (prevEma == null) {
        prevEma = v;
      } else {
        prevEma = alpha * v + (1 - alpha) * prevEma;
      }
      out.push(prevEma);
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

  let step = 0.1;
  if (span > 12) step = 1;
  else if (span > 6) step = 0.5;
  else if (span > 3) step = 0.2;
  else step = 0.1;

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

function buildKcalTicks(min: number, max: number) {
  const span = max - min;
  let step = 20;

  if (span > 1200) step = 200;
  else if (span > 800) step = 100;
  else if (span > 400) step = 50;
  else if (span > 200) step = 25;
  else step = 20;

  const out: number[] = [];
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  for (let v = start; v <= end + 1e-9; v += step) {
    const vv = Math.round(v * 10) / 10;
    if (vv >= min - 1e-9 && vv <= max + 1e-9) out.push(vv);
    if (out.length > 100) break;
  }

  return out;
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

function getWeightRequestRangeYmdByPreset(
  preset: WeightRangePreset,
  anchorYmd: string
): RangeYmd {
  if (preset === "all") {
    return { from: "2000-01-01", to: anchorYmd };
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
    from: addMonthsYmd(anchorYmd, -months),
    to: anchorYmd,
  };
}

function calcAdaptiveChartWidthPx(
  totalCount: number,
  visibleCount: number,
  viewportWidth: number,
  maxWidthPx = 36000
) {
  const safeViewport = Math.max(760, viewportWidth || 0);
  const safeTotal = Math.max(1, totalCount);
  const safeVisible = Math.max(1, Math.min(safeTotal, visibleCount || 1));
  const width = Math.round((safeViewport * safeTotal) / safeVisible);

  return Math.max(safeViewport, Math.min(maxWidthPx, width));
}

function calcCategoryShowTextEvery(
  totalCount: number,
  chartWidthPx: number,
  pxPerLabel: number
) {
  const desiredLabels = clamp(Math.floor(chartWidthPx / pxPerLabel), 1, 500);
  return Math.max(1, Math.ceil(totalCount / desiredLabels));
}

function getChartTitleFontSize(days: number) {
  if (days <= 7) return 16;
  if (days <= 30) return 18;
  return 20;
}

function getAxisFontSize(days: number) {
  if (days <= 7) return 9;
  if (days <= 30) return 10;
  return 11;
}

function formatAxisValue(n: number) {
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function findLastNonNullIndex(values: Array<number | null>) {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) return i;
  }
  return 0;
}

function calcLatestAlignedScrollLeft(params: {
  chartWidthPx: number;
  viewportWidth: number;
  totalCount: number;
  lastIndex: number;
  mode: "category" | "timeline";
}) {
  const { chartWidthPx, viewportWidth, totalCount, lastIndex, mode } = params;

  if (viewportWidth <= 0 || chartWidthPx <= viewportWidth || totalCount <= 0) {
    return 0;
  }

  const plotLeft = CHART_PLOT_LEFT_PX;
  const plotWidth = chartWidthPx * CHART_PLOT_WIDTH_RATIO;
  const safeLastIndex = clamp(lastIndex, 0, Math.max(0, totalCount - 1));

  let x = plotLeft;

  if (mode === "category") {
    x =
      plotLeft + plotWidth * ((safeLastIndex + 0.5) / Math.max(1, totalCount));
  } else {
    x =
      totalCount <= 1
        ? plotLeft
        : plotLeft + plotWidth * (safeLastIndex / (totalCount - 1));
  }

  const rightPaddingPx = clamp(Math.round(viewportWidth * 0.06), 24, 56);
  const desired = x - (viewportWidth - rightPaddingPx);
  const maxScrollLeft = Math.max(0, chartWidthPx - viewportWidth);

  return clamp(Math.round(desired), 0, maxScrollLeft);
}

function getWeightSeriesLabel(
  kind: WeightSmoothKind,
  period: WeightSmoothPeriod
) {
  if (kind === "actual") return "実測値";
  if (kind === "ema") return `EMA${period}`;
  return `MA${period}`;
}

function getWeightSeriesColor(
  kind: WeightSmoothKind,
  period: WeightSmoothPeriod
) {
  if (kind === "actual") return "#2563eb";

  if (kind === "ema") {
    if (period === 3) return "#f97316";
    if (period === 7) return "#16a34a";
    return "#0f766e";
  }

  if (period === 3) return "#dc2626";
  if (period === 7) return "#7c3aed";
  return "#475569";
}

type FixedYAxisProps = {
  title: string;
  height: number;
  plotTop: number;
  plotHeight: number;
  min: number;
  max: number;
  ticks: number[];
  fontSize: number;
  borderColor?: string;
  backgroundColor?: string;
};

function FixedYAxis({
  title,
  height,
  plotTop,
  plotHeight,
  min,
  max,
  ticks,
  fontSize,
  borderColor = "#ddd",
  backgroundColor = "#f5f6f8",
}: FixedYAxisProps) {
  const safeSpan = max - min === 0 ? 1 : max - min;

  return (
    <div
      style={{
        position: "relative",
        width: FIXED_Y_AXIS_WIDTH,
        height,
        background: backgroundColor,
        border: `1px solid ${borderColor}`,
        borderRight: "none",
        borderRadius: "16px 0 0 16px",
        overflow: "hidden",
        flex: `0 0 ${FIXED_Y_AXIS_WIDTH}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 14,
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
          transformOrigin: "left top",
          fontSize: fontSize + 2,
          fontStyle: "italic",
          color: "#333",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>

      {ticks.map((tick, i) => {
        const ratio = (tick - min) / safeSpan;
        const y = plotTop + plotHeight * (1 - ratio);

        return (
          <div key={`${tick}-${i}`}>
            <div
              style={{
                position: "absolute",
                right: 10,
                top: y - (fontSize + 2) / 2,
                fontSize,
                color: "#444",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {formatAxisValue(tick)}
            </div>

            <div
              style={{
                position: "absolute",
                right: 0,
                top: y,
                width: 6,
                borderTop: "1px solid #777",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

type ScrollableChartShellProps = {
  axis: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  chartRef: RefObject<HTMLDivElement | null>;
  chartWidthPx: number;
  chartHeightPx: number;
};

function ScrollableChartShell({
  axis,
  scrollRef,
  chartRef,
  chartWidthPx,
  chartHeightPx,
}: ScrollableChartShellProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${FIXED_Y_AXIS_WIDTH}px minmax(0,1fr)`,
        alignItems: "stretch",
      }}
    >
      {axis}

      <div
        style={{
          minWidth: 0,
          background: "#f5f6f8",
          border: "1px solid #ddd",
          borderLeft: "none",
          borderRadius: "0 16px 16px 0",
          overflow: "hidden",
        }}
      >
        <div
          ref={scrollRef}
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            paddingBottom: 8,
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            ref={chartRef}
            style={{
              width: `${chartWidthPx}px`,
              minWidth: "100%",
              minHeight: chartHeightPx,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function SummaryPage() {
  const [rows, setRows] = useState<MealRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [msg, setMsg] = useState("");

  const [preset, setPreset] = useState<Preset>("7");
  const [offsetDays, setOffsetDays] = useState<number>(0);

  const [weightRangePreset, setWeightRangePreset] =
    useState<WeightRangePreset>("1m");

  const [weightSmoothKind, setWeightSmoothKind] =
    useState<WeightSmoothKind>("ema");
  const [weightSmoothPeriod, setWeightSmoothPeriod] =
    useState<WeightSmoothPeriod>(7);

  const [fromDate, setFromDate] = useState<string>(() => {
    const today = jstYmd(new Date());
    return addDaysYmd(today, -6);
  });
  const [toDate, setToDate] = useState<string>(() => jstYmd(new Date()));

  const groupChartRef = useRef<HTMLDivElement | null>(null);
  const dailyChartRef = useRef<HTMLDivElement | null>(null);
  const weightChartRef = useRef<HTMLDivElement | null>(null);

  const groupScrollWrapRef = useRef<HTMLDivElement | null>(null);
  const dailyScrollWrapRef = useRef<HTMLDivElement | null>(null);
  const weightScrollWrapRef = useRef<HTMLDivElement | null>(null);

  const [groupViewportWidth, setGroupViewportWidth] = useState(0);
  const [dailyViewportWidth, setDailyViewportWidth] = useState(0);
  const [weightViewportWidth, setWeightViewportWidth] = useState(0);

  useEffect(() => {
    const update = () => {
      setGroupViewportWidth(groupScrollWrapRef.current?.clientWidth ?? 0);
      setDailyViewportWidth(dailyScrollWrapRef.current?.clientWidth ?? 0);
      setWeightViewportWidth(weightScrollWrapRef.current?.clientWidth ?? 0);
    };

    update();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => update())
        : null;

    if (groupScrollWrapRef.current) ro?.observe(groupScrollWrapRef.current);
    if (dailyScrollWrapRef.current) ro?.observe(dailyScrollWrapRef.current);
    if (weightScrollWrapRef.current) ro?.observe(weightScrollWrapRef.current);

    window.addEventListener("resize", update);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const load = async () => {
    setMsg("");

    const today = jstYmd(new Date());
    const allFrom = "2000-01-01";

    const mealsUrl = `/api/summary/meals?from=${allFrom}&to=${today}`;
    const weightsUrl = `/api/weights?from=${allFrom}&to=${today}`;

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
    load().catch((e: unknown) =>
      setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
    );
  }, []);

  const latestMealDate = useMemo(() => {
    if (rows.length === 0) return jstYmd(new Date());

    let latest = "2000-01-01";
    for (const r of rows) {
      const d = toDateKey(r.dt);
      if (d > latest) latest = d;
    }
    return latest;
  }, [rows]);

  const activeRangeYmd = useMemo(() => {
    if (preset === "custom") {
      return { from: fromDate, to: toDate, days: null as number | null };
    }

    const days = presetDays(preset);
    const to = addDaysYmd(latestMealDate, -offsetDays);
    const from = addDaysYmd(to, -(days - 1));

    return { from, to, days };
  }, [preset, fromDate, toDate, offsetDays, latestMealDate]);

  const mealRangeDays = useMemo(() => {
    return daysBetweenYmd(activeRangeYmd.from, activeRangeYmd.to);
  }, [activeRangeYmd.from, activeRangeYmd.to]);

  const showMealDataLabels = useMemo(() => {
    return mealRangeDays < 30;
  }, [mealRangeDays]);

  const showWeightDataLabels = useMemo(() => {
    return (
      weightRangePreset === "1m" ||
      weightRangePreset === "2m" ||
      weightRangePreset === "3m" ||
      weightRangePreset === "6m"
    );
  }, [weightRangePreset]);

  const visibleMealRows = useMemo(() => {
    return rows.filter((r) => {
      const d = toDateKey(r.dt);
      return isYmdInRange(d, activeRangeYmd.from, activeRangeYmd.to);
    });
  }, [rows, activeRangeYmd.from, activeRangeYmd.to]);

  const grouped15All = useMemo(() => {
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

  const visibleGroupedCount = useMemo(() => {
    const count = grouped15All.filter((g) =>
      isYmdInRange(toDateKey(g.start), activeRangeYmd.from, activeRangeYmd.to)
    ).length;

    return Math.max(1, count);
  }, [grouped15All, activeRangeYmd.from, activeRangeYmd.to]);

  const dailyAll = useMemo(() => {
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

  const dailyVisible = useMemo(() => {
    return dailyAll.filter((d) =>
      isYmdInRange(d.date, activeRangeYmd.from, activeRangeYmd.to)
    );
  }, [dailyAll, activeRangeYmd.from, activeRangeYmd.to]);

  const fullMealRangeYmd = useMemo(() => {
    if (dailyAll.length === 0) {
      const today = jstYmd(new Date());
      return {
        from: addDaysYmd(today, -6),
        to: today,
      };
    }

    return {
      from: dailyAll[0].date,
      to: dailyAll[dailyAll.length - 1].date,
    };
  }, [dailyAll]);

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

  const latestWeightDate = useMemo(() => {
    const keys = Array.from(dailyWeightMap.keys()).sort();
    return keys[keys.length - 1] ?? jstYmd(new Date());
  }, [dailyWeightMap]);

  const fullWeightRangeYmd = useMemo(() => {
    return {
      from: Array.from(dailyWeightMap.keys()).sort()[0] ?? latestWeightDate,
      to: latestWeightDate,
    };
  }, [dailyWeightMap, latestWeightDate]);

  const weightInitialRangeYmd = useMemo(() => {
    return getWeightRequestRangeYmdByPreset(weightRangePreset, latestWeightDate);
  }, [weightRangePreset, latestWeightDate]);

  const weightRangeDays = useMemo(() => {
    return daysBetweenYmd(weightInitialRangeYmd.from, weightInitialRangeYmd.to);
  }, [weightInitialRangeYmd.from, weightInitialRangeYmd.to]);

  const visibleWeightRows = useMemo(() => {
    return weights.filter((w) => {
      const d = toDateKey(w.dt);
      return isYmdInRange(d, weightInitialRangeYmd.from, weightInitialRangeYmd.to);
    });
  }, [weights, weightInitialRangeYmd.from, weightInitialRangeYmd.to]);

  const weightSeriesForChart = useMemo(() => {
    const dates = buildDateSeriesYmd(
      fullWeightRangeYmd.from,
      fullWeightRangeYmd.to
    );

    const base = dates.map((date) => {
      const w = dailyWeightMap.get(date)?.weightKg ?? null;
      return { date, weightKg: w };
    });

    const baseValues = base.map((x) => x.weightKg);

    const ma3 = movingAvgLastNObservations(baseValues, 3);
    const ma7 = movingAvgLastNObservations(baseValues, 7);
    const ma14 = movingAvgLastNObservations(baseValues, 14);

    const ema3 = exponentialAvgLastNObservations(baseValues, 3);
    const ema7 = exponentialAvgLastNObservations(baseValues, 7);
    const ema14 = exponentialAvgLastNObservations(baseValues, 14);

    return base.map((x, i) => ({
      ...x,
      ma3: x.weightKg == null ? null : ma3[i],
      ma7: x.weightKg == null ? null : ma7[i],
      ma14: x.weightKg == null ? null : ma14[i],
      ema3: x.weightKg == null ? null : ema3[i],
      ema7: x.weightKg == null ? null : ema7[i],
      ema14: x.weightKg == null ? null : ema14[i],
    }));
  }, [dailyWeightMap, fullWeightRangeYmd.from, fullWeightRangeYmd.to]);

  const activeWeightSeries = useMemo(() => {
    return weightSeriesForChart.map((d) => {
      let value: number | null = d.weightKg;

      if (weightSmoothKind === "ema") {
        if (weightSmoothPeriod === 3) value = d.ema3;
        else if (weightSmoothPeriod === 7) value = d.ema7;
        else value = d.ema14;
      } else if (weightSmoothKind === "ma") {
        if (weightSmoothPeriod === 3) value = d.ma3;
        else if (weightSmoothPeriod === 7) value = d.ma7;
        else value = d.ma14;
      }

      return {
        date: d.date,
        value,
      };
    });
  }, [weightSeriesForChart, weightSmoothKind, weightSmoothPeriod]);

  const weightSeriesLabel = useMemo(() => {
    return getWeightSeriesLabel(weightSmoothKind, weightSmoothPeriod);
  }, [weightSmoothKind, weightSmoothPeriod]);

  const weightSeriesColor = useMemo(() => {
    return getWeightSeriesColor(weightSmoothKind, weightSmoothPeriod);
  }, [weightSmoothKind, weightSmoothPeriod]);

  const dailyKcalSeriesAll = useMemo(() => {
    const allDates = buildDateSeriesYmd(fullMealRangeYmd.from, fullMealRangeYmd.to);

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
  }, [rows, fullMealRangeYmd.from, fullMealRangeYmd.to]);

  const groupChartWidthPx = useMemo(() => {
    return calcAdaptiveChartWidthPx(
      grouped15All.length,
      visibleGroupedCount,
      groupViewportWidth
    );
  }, [grouped15All.length, visibleGroupedCount, groupViewportWidth]);

  const dailyChartWidthPx = useMemo(() => {
    return calcAdaptiveChartWidthPx(
      dailyKcalSeriesAll.dates.length,
      mealRangeDays,
      dailyViewportWidth
    );
  }, [dailyKcalSeriesAll.dates.length, mealRangeDays, dailyViewportWidth]);

  const weightChartWidthPx = useMemo(() => {
    return calcAdaptiveChartWidthPx(
      activeWeightSeries.length,
      weightRangeDays,
      weightViewportWidth
    );
  }, [activeWeightSeries.length, weightRangeDays, weightViewportWidth]);

  const groupChartHeight = 360;
  const dailyChartHeight = 360;
  const weightChartHeight = 380;

  const mealPlotTop = 14;
  const mealPlotHeight = groupChartHeight * 0.74;

  const weightPlotTop = 14;
  const weightPlotHeight = weightChartHeight * 0.7;

  const maxGroup = useMemo(() => {
    return Math.max(0, ...grouped15All.map((g) => Number(g.totalNetKcal) || 0));
  }, [grouped15All]);

  const vMaxGroup = useMemo(() => {
    return maxGroup <= 200 ? 200 : (Math.floor(maxGroup / 100) + 1) * 100;
  }, [maxGroup]);

  const groupTicks = useMemo(() => {
    return buildKcalTicks(0, vMaxGroup);
  }, [vMaxGroup]);

  const maxDaily = useMemo(() => {
    return Math.max(0, ...dailyKcalSeriesAll.kcal.map((v) => Number(v) || 0));
  }, [dailyKcalSeriesAll.kcal]);

  const vMaxDaily = useMemo(() => {
    return maxDaily <= 400 ? 400 : (Math.floor(maxDaily / 100) + 1) * 100;
  }, [maxDaily]);

  const dailyTicks = useMemo(() => {
    return buildKcalTicks(0, vMaxDaily);
  }, [vMaxDaily]);

  const weightVals = useMemo(() => {
    return activeWeightSeries
      .map((d) => (d.value == null ? null : Number(d.value)))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  }, [activeWeightSeries]);

  const vMinWeight = useMemo(() => {
    const minW = weightVals.length ? Math.min(...weightVals) : Number.NaN;
    return Number.isFinite(minW) && minW < 2.5 ? 0 : 2.5;
  }, [weightVals]);

  const vMaxWeight = useMemo(() => {
    const maxW = weightVals.length ? Math.max(...weightVals) : Number.NaN;
    if (Number.isFinite(maxW) && maxW > 5.0) {
      return Math.ceil((maxW + 1.0) * 10) / 10;
    }
    return 5.0;
  }, [weightVals]);

  const weightTicks = useMemo(() => {
    return buildWeightTicks(vMinWeight, vMaxWeight);
  }, [vMinWeight, vMaxWeight]);

  const groupLatestIndex = useMemo(() => {
    return Math.max(0, grouped15All.length - 1);
  }, [grouped15All.length]);

  const dailyLatestIndex = useMemo(() => {
    const merged = dailyKcalSeriesAll.kcal.map((v, i) =>
      v != null ? v : dailyKcalSeriesAll.avg7[i]
    );
    return findLastNonNullIndex(merged);
  }, [dailyKcalSeriesAll.kcal, dailyKcalSeriesAll.avg7]);

  const weightLatestIndex = useMemo(() => {
    return findLastNonNullIndex(activeWeightSeries.map((d) => d.value));
  }, [activeWeightSeries]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const wrap = groupScrollWrapRef.current;
      if (!wrap) return;

      wrap.scrollLeft = calcLatestAlignedScrollLeft({
        chartWidthPx: groupChartWidthPx,
        viewportWidth: wrap.clientWidth,
        totalCount: grouped15All.length,
        lastIndex: groupLatestIndex,
        mode: "category",
      });
    });

    return () => cancelAnimationFrame(id);
  }, [groupChartWidthPx, grouped15All.length, groupLatestIndex, activeRangeYmd.to]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const wrap = dailyScrollWrapRef.current;
      if (!wrap) return;

      wrap.scrollLeft = calcLatestAlignedScrollLeft({
        chartWidthPx: dailyChartWidthPx,
        viewportWidth: wrap.clientWidth,
        totalCount: dailyKcalSeriesAll.dates.length,
        lastIndex: dailyLatestIndex,
        mode: "timeline",
      });
    });

    return () => cancelAnimationFrame(id);
  }, [dailyChartWidthPx, dailyKcalSeriesAll.dates.length, dailyLatestIndex, activeRangeYmd.to]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const wrap = weightScrollWrapRef.current;
      if (!wrap) return;

      wrap.scrollLeft = calcLatestAlignedScrollLeft({
        chartWidthPx: weightChartWidthPx,
        viewportWidth: wrap.clientWidth,
        totalCount: activeWeightSeries.length,
        lastIndex: weightLatestIndex,
        mode: "timeline",
      });
    });

    return () => cancelAnimationFrame(id);
  }, [
    weightChartWidthPx,
    activeWeightSeries.length,
    weightLatestIndex,
    weightRangePreset,
    weightSmoothKind,
    weightSmoothPeriod,
  ]);

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

      const mealAxisFontSize = getAxisFontSize(mealRangeDays);
      const weightAxisFontSize = getAxisFontSize(weightRangeDays);

      {
        const gData = new googleObj.visualization.DataTable();
        gData.addColumn("string", "開始");
        gData.addColumn("number", "実食kcal");
        gData.addColumn({ type: "number", role: "annotation" });

        const sortedGroups = [...grouped15All].sort((a, b) =>
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
          backgroundColor: "#f5f6f8",
          chartArea: {
            left: CHART_PLOT_LEFT_PX,
            top: mealPlotTop,
            width: "92%",
            height: "74%",
            backgroundColor: { fill: "#ffffff", rx: 14, ry: 14 },
          },
          annotations: {
            alwaysOutside: false,
            stem: { length: 5 },
            textStyle: {
              fontSize: mealRangeDays <= 7 ? 9 : 10,
              color: "#333",
              bold: false,
            },
          },
          tooltip: {
            textStyle: {
              fontSize: TOOLTIP_FONT_SIZE,
            },
          },
          height: groupChartHeight,
          legend: { position: "none" },
          colors: ["#6ec6ff"],
          bar: {
            groupWidth:
              mealRangeDays <= 7
                ? "62%"
                : mealRangeDays <= 30
                  ? "72%"
                  : "78%",
          },
          hAxis: {
            slantedText: false,
            showTextEvery: calcCategoryShowTextEvery(
              sortedGroups.length,
              groupChartWidthPx,
              mealRangeDays <= 7 ? 70 : 84
            ),
            textStyle: { fontSize: mealAxisFontSize },
          },
          vAxis: {
            textPosition: "none",
            viewWindow: { min: 0, max: vMaxGroup },
            ticks: groupTicks,
            gridlines: { color: "#86f8f6" },
            minorGridlines: { color: "#d0f6ef", count: 4 },
          },
        });
      }

      {
        const dData = new googleObj.visualization.DataTable();
        dData.addColumn("date", "日付");
        dData.addColumn("number", "実食kcal");
        dData.addColumn({ type: "number", role: "annotation" });
        dData.addColumn("number", "7日平均");
        dData.addColumn({ type: "number", role: "annotation" });

        dData.addRows(
          dailyKcalSeriesAll.dates.map((ymd, i) => {
            const v = dailyKcalSeriesAll.kcal[i];
            const a = dailyKcalSeriesAll.avg7[i];

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
          backgroundColor: "#f5f6f8",
          chartArea: {
            left: CHART_PLOT_LEFT_PX,
            top: mealPlotTop,
            width: "92%",
            height: "74%",
            backgroundColor: { fill: "#ffffff", rx: 14, ry: 14 },
          },
          annotations: {
            alwaysOutside: false,
            stem: { length: 5 },
            textStyle: {
              fontSize: mealRangeDays <= 7 ? 9 : 10,
              color: "#333",
              bold: false,
            },
          },
          tooltip: {
            textStyle: {
              fontSize: TOOLTIP_FONT_SIZE,
            },
          },
          height: dailyChartHeight,
          legend: {
            position: "bottom",
            textStyle: { fontSize: mealAxisFontSize },
          },
          seriesType: "bars",
          series: { 0: { type: "bars" }, 1: { type: "line" } },
          colors: ["#4facfe", "#7bd3ff"],
          bar: {
            groupWidth:
              mealRangeDays <= 7
                ? "56%"
                : mealRangeDays <= 30
                  ? "66%"
                  : "76%",
          },
          hAxis: {
            ticks: buildCompactDateAxisTicksByWidth(
              fullMealRangeYmd.from,
              fullMealRangeYmd.to,
              dailyChartWidthPx
            ),
            slantedText: false,
            textStyle: { fontSize: mealAxisFontSize },
            maxAlternation: 1,
          },
          vAxis: {
            textPosition: "none",
            viewWindow: { min: 0, max: vMaxDaily },
            ticks: dailyTicks,
            gridlines: { color: "#8cf4df" },
            minorGridlines: { color: "#d5f3f7", count: 4 },
          },
        });
      }

      {
        const wData = new googleObj.visualization.DataTable();
        wData.addColumn("date", "日付");
        wData.addColumn("number", weightSeriesLabel);
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

        chart.draw(wData, {
          backgroundColor: "#f5f6f8",
          chartArea: {
            left: CHART_PLOT_LEFT_PX,
            top: weightPlotTop,
            width: "92%",
            height: "70%",
            backgroundColor: { fill: "#ffffff", rx: 14, ry: 14 },
          },
          annotations: {
            alwaysOutside: false,
            stem: { length: 5 },
            textStyle: {
              fontSize: weightRangeDays <= 31 ? 9 : 10,
              color: "#333",
              bold: false,
            },
          },
          tooltip: {
            textStyle: {
              fontSize: TOOLTIP_FONT_SIZE,
            },
          },
          height: weightChartHeight,
          legend: { position: "none" },
          interpolateNulls: true,
          colors: [weightSeriesColor],
          pointSize: weightRangeDays <= 31 ? 4 : 3,
          lineWidth: 2,
          hAxis: {
            ticks: buildCompactDateAxisTicksByWidth(
              fullWeightRangeYmd.from,
              fullWeightRangeYmd.to,
              weightChartWidthPx
            ),
            slantedText: false,
            textStyle: { fontSize: weightAxisFontSize },
            maxAlternation: 1,
            gridlines: { color: "#e7e7e7" },
            minorGridlines: { color: "#f2f2f2" },
          },
          vAxis: {
            textPosition: "none",
            viewWindow: { min: vMinWeight, max: vMaxWeight },
            ticks: weightTicks,
            gridlines: { color: "#cffff5" },
            minorGridlines: { color: "#1188b0", count: 3 },
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
    grouped15All,
    activeWeightSeries,
    weightSeriesLabel,
    weightSeriesColor,
    dailyKcalSeriesAll,
    showMealDataLabels,
    showWeightDataLabels,
    mealRangeDays,
    weightRangeDays,
    groupChartWidthPx,
    dailyChartWidthPx,
    weightChartWidthPx,
    fullMealRangeYmd.from,
    fullMealRangeYmd.to,
    fullWeightRangeYmd.from,
    fullWeightRangeYmd.to,
    groupTicks,
    dailyTicks,
    vMaxGroup,
    vMaxDaily,
    weightTicks,
    vMinWeight,
    vMaxWeight,
    mealPlotTop,
    weightPlotTop,
  ]);

  const onPreset = (p: Preset) => {
    setPreset(p);
    setOffsetDays(0);

    if (p !== "custom") return;

    setToDate(latestMealDate);
    setFromDate(addDaysYmd(latestMealDate, -6));
  };

  const onCustomApply = () => {
    if (fromDate > toDate) {
      setMsg("ERROR: 開始日は終了日以前にしてください");
      return;
    }
    setMsg("");
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
    return `${weightInitialRangeYmd.from} 〜 ${weightInitialRangeYmd.to}`;
  }, [weightInitialRangeYmd.from, weightInitialRangeYmd.to]);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2>集計</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      <div className="summary-toolbar">
        <button
          className="summary-reload-btn"
          onClick={() =>
            load().catch((e: unknown) =>
              setMsg("ERROR: " + String(e instanceof Error ? e.message : e))
            )
          }
        >
          再読込
        </button>

        <div className="summary-range-box">
          <div className="summary-range-top">
            <span className="summary-range-label">給餌グラフ縮尺：</span>

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
        全期間保持：給餌 {rows.length} 件 / 体重 {weights.length} 件
      </div>
      <div style={{ marginTop: 4, color: "#555" }}>
        現在の表示範囲データ：給餌 {visibleMealRows.length} 件 / 体重 {visibleWeightRows.length} 件
      </div>

      <h3
        style={{
          marginTop: 16,
          marginBottom: 8,
          fontSize: getChartTitleFontSize(mealRangeDays),
          fontWeight: 700,
        }}
      >
        15分ルール：1回分の実食kcal（朝/昼/夜/深夜）
      </h3>
      <ScrollableChartShell
        axis={
          <FixedYAxis
            title="kcal"
            height={groupChartHeight}
            plotTop={mealPlotTop}
            plotHeight={mealPlotHeight}
            min={0}
            max={vMaxGroup}
            ticks={groupTicks}
            fontSize={getAxisFontSize(mealRangeDays)}
          />
        }
        scrollRef={groupScrollWrapRef}
        chartRef={groupChartRef}
        chartWidthPx={groupChartWidthPx}
        chartHeightPx={groupChartHeight}
      />

      <h3
        style={{
          marginTop: 16,
          marginBottom: 8,
          fontSize: getChartTitleFontSize(mealRangeDays),
          fontWeight: 700,
        }}
      >
        日別 実食カロリー（棒）＋ 7日平均（線）
      </h3>
      <ScrollableChartShell
        axis={
          <FixedYAxis
            title="kcal"
            height={dailyChartHeight}
            plotTop={mealPlotTop}
            plotHeight={mealPlotHeight}
            min={0}
            max={vMaxDaily}
            ticks={dailyTicks}
            fontSize={getAxisFontSize(mealRangeDays)}
          />
        }
        scrollRef={dailyScrollWrapRef}
        chartRef={dailyChartRef}
        chartWidthPx={dailyChartWidthPx}
        chartHeightPx={dailyChartHeight}
      />

      <div style={{ marginTop: 16, color: "#666", fontSize: 14 }}>
        体重グラフ縮尺
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
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {(["actual", "ema", "ma"] as WeightSmoothKind[]).map((kind) => {
          const label =
            kind === "actual" ? "実測値" : kind === "ema" ? "EMA" : "MA";
          const active = weightSmoothKind === kind;

          return (
            <button
              key={kind}
              type="button"
              onClick={() => setWeightSmoothKind(kind)}
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                border: "1px solid #d4d4d8",
                background: active ? "#18181b" : "#fff",
                color: active ? "#fff" : "#18181b",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          );
        })}
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
        {([3, 7, 14] as WeightSmoothPeriod[]).map((period) => {
          const active = weightSmoothPeriod === period;
          const disabled = weightSmoothKind === "actual";

          return (
            <button
              key={period}
              type="button"
              disabled={disabled}
              onClick={() => setWeightSmoothPeriod(period)}
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                border: "1px solid #d4d4d8",
                background: active && !disabled ? "#18181b" : "#fff",
                color: active && !disabled ? "#fff" : "#18181b",
                fontSize: 14,
                fontWeight: 600,
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {period}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 4, color: "#666", fontSize: 14 }}>
        体重グラフ表示範囲：{weightRangeText}
      </div>
      <div style={{ marginTop: 4, color: "#666", fontSize: 14 }}>
        表示系列：{weightSeriesLabel}
      </div>

      <h3
        style={{
          marginTop: 12,
          marginBottom: 8,
          fontSize: getChartTitleFontSize(weightRangeDays),
          fontWeight: 700,
        }}
      >
        体重（{weightSeriesLabel}）
      </h3>
      <ScrollableChartShell
        axis={
          <FixedYAxis
            title="kg"
            height={weightChartHeight}
            plotTop={weightPlotTop}
            plotHeight={weightPlotHeight}
            min={vMinWeight}
            max={vMaxWeight}
            ticks={weightTicks}
            fontSize={Math.max(7, getAxisFontSize(weightRangeDays) - 2)}
          />
        }
        scrollRef={weightScrollWrapRef}
        chartRef={weightChartRef}
        chartWidthPx={weightChartWidthPx}
        chartHeightPx={weightChartHeight}
      />

      <h3 style={{ marginTop: 16 }}>日別合計（表示範囲のみ / kcalで統一）</h3>

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
          {dailyVisible.map((d) => (
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

          {dailyVisible.length === 0 && (
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