import { jstYmd, toJstDateKey } from "@/lib/calorieWarning";

export const DEFAULT_WEIGHT_WARNING_DAYS = 10;
export const DEFAULT_STOOL_WARNING_DAYS = 2;
export const DEFAULT_URINE_WARNING_DAYS = 2;

export type HealthWarningSettings = {
  weightWarningDays: number;
  stoolWarningDays: number;
  urineWarningDays: number;
};

export type WeightWarningRecord = {
  dt: string;
};

export type EliminationWarningRecord = {
  dt: string;
  kind?: string | null;
  stool?: string | null;
  urine?: string | null;
};

export type HealthRecordWarning = {
  key: "weight" | "stool" | "urine";
  message: string;
};

export function normalizeWarningDays(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function daysBetweenYmd(fromYmd: string, toYmd: string) {
  const from = new Date(`${fromYmd}T00:00:00+09:00`).getTime();
  const to = new Date(`${toYmd}T00:00:00+09:00`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function latestDateKey<T extends { dt: string }>(
  rows: T[],
  predicate: (row: T) => boolean = () => true
) {
  let latest: string | null = null;
  for (const row of rows) {
    if (!predicate(row)) continue;
    const dateKey = toJstDateKey(row.dt);
    if (latest == null || dateKey > latest) latest = dateKey;
  }
  return latest;
}

function isStoolRecord(row: EliminationWarningRecord) {
  const kind = String(row.kind ?? "").trim().toLowerCase();
  return Boolean(row.stool) || kind === "stool" || kind === "poop" || kind === "both" || kind.includes("うん");
}

function isUrineRecord(row: EliminationWarningRecord) {
  const kind = String(row.kind ?? "").trim().toLowerCase();
  return Boolean(row.urine) || kind === "urine" || kind === "pee" || kind === "both" || kind.includes("おし");
}

export function calculateHealthRecordWarnings({
  weightRows,
  eliminationRows,
  settings,
  todayYmd = jstYmd(new Date()),
}: {
  weightRows: WeightWarningRecord[];
  eliminationRows: EliminationWarningRecord[];
  settings: HealthWarningSettings;
  todayYmd?: string;
}) {
  const weightDays = normalizeWarningDays(
    settings.weightWarningDays,
    DEFAULT_WEIGHT_WARNING_DAYS
  );
  const stoolDays = normalizeWarningDays(
    settings.stoolWarningDays,
    DEFAULT_STOOL_WARNING_DAYS
  );
  const urineDays = normalizeWarningDays(
    settings.urineWarningDays,
    DEFAULT_URINE_WARNING_DAYS
  );

  const latestWeight = latestDateKey(weightRows);
  const latestStool = latestDateKey(eliminationRows, isStoolRecord);
  const latestUrine = latestDateKey(eliminationRows, isUrineRecord);
  const warnings: HealthRecordWarning[] = [];

  if (
    latestWeight == null ||
    daysBetweenYmd(latestWeight, todayYmd) >= weightDays
  ) {
    warnings.push({
      key: "weight",
      message: `過去${weightDays}日間、体重が記録されていません`,
    });
  }

  if (
    latestStool == null ||
    daysBetweenYmd(latestStool, todayYmd) > stoolDays
  ) {
    warnings.push({
      key: "stool",
      message: `${stoolDays}日を超えて、うんちの記録がありません`,
    });
  }

  if (
    latestUrine == null ||
    daysBetweenYmd(latestUrine, todayYmd) > urineDays
  ) {
    warnings.push({
      key: "urine",
      message: `${urineDays}日を超えて、おしっこの記録がありません`,
    });
  }

  return warnings;
}
