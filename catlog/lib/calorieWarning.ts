export const DEFAULT_DAILY_KCAL_WARNING_THRESHOLD = 240;
export const CALORIE_WARNING_LOOKBACK_DAYS = 7;

export type CalorieMealRecord = {
  dt: string;
  kcal?: number | null;
  leftover_g?: number | null;
  kcal_per_g_snapshot?: number | null;
  net_kcal?: number | null;
};

export type DailyCalorieWarning = {
  date: string;
  totalKcal: number;
};

export function jstYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysYmd(ymd: string, delta: number) {
  const date = new Date(`${ymd}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + delta);
  return jstYmd(date);
}

export function toJstDateKey(dtIso: string) {
  return jstYmd(new Date(dtIso));
}

export function normalizeCalorieWarningThreshold(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DAILY_KCAL_WARNING_THRESHOLD;
}

export function getRecentJstDateKeys(
  todayYmd = jstYmd(new Date()),
  days = CALORIE_WARNING_LOOKBACK_DAYS
) {
  const safeDays = Math.max(1, Math.floor(days));
  return Array.from({ length: safeDays }, (_, index) =>
    addDaysYmd(todayYmd, index - safeDays)
  );
}

export function getJstDayRangeIso(fromYmd: string, toYmd: string) {
  return {
    fromIso: `${fromYmd}T00:00:00+09:00`,
    toIso: `${toYmd}T23:59:59.999+09:00`,
  };
}

export function calculateMealNetKcal(row: CalorieMealRecord) {
  if (row.net_kcal != null && Number.isFinite(Number(row.net_kcal))) {
    return Math.max(0, Number(row.net_kcal));
  }

  const kcal = Number(row.kcal ?? 0);
  const leftoverGrams = Number(row.leftover_g ?? 0);
  const kcalPerGram = Number(row.kcal_per_g_snapshot ?? Number.NaN);
  const netKcal = Number.isFinite(kcalPerGram)
    ? kcal - leftoverGrams * kcalPerGram
    : kcal;

  return Math.max(0, Number.isFinite(netKcal) ? netKcal : 0);
}

export function calculateDailyCalorieWarnings({
  rows,
  threshold,
  todayYmd = jstYmd(new Date()),
  days = CALORIE_WARNING_LOOKBACK_DAYS,
}: {
  rows: CalorieMealRecord[];
  threshold: number;
  todayYmd?: string;
  days?: number;
}) {
  const normalizedThreshold = normalizeCalorieWarningThreshold(threshold);
  const dateKeys = getRecentJstDateKeys(todayYmd, days);
  const totals = new Map(dateKeys.map((date) => [date, 0]));

  for (const row of rows) {
    const date = toJstDateKey(row.dt);
    if (!totals.has(date)) continue;
    totals.set(date, (totals.get(date) ?? 0) + calculateMealNetKcal(row));
  }

  return dateKeys.flatMap<DailyCalorieWarning>((date) => {
    const totalKcal = Number((totals.get(date) ?? 0).toFixed(1));
    return totalKcal <= normalizedThreshold ? [{ date, totalKcal }] : [];
  });
}

export function formatCalorieWarningDate(ymd: string) {
  const [, month, day] = ymd.split("-").map(Number);
  return `${month}月${day}日`;
}
