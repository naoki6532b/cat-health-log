import {
  type DailyCalorieWarning,
  formatCalorieWarningDate,
} from "@/lib/calorieWarning";

export default function CalorieWarningBanner({
  warnings,
  additionalWarnings = [],
}: {
  warnings: DailyCalorieWarning[];
  additionalWarnings?: string[];
}) {
  if (warnings.length === 0 && additionalWarnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
    >
      <div className="space-y-1 text-sm font-semibold text-red-700">
        {warnings.map((warning) => (
          <div key={warning.date}>
            {formatCalorieWarningDate(warning.date)}の給餌カロリーが不十分です
          </div>
        ))}
        {additionalWarnings.map((warning) => (
          <div key={warning}>{warning}</div>
        ))}
      </div>
    </div>
  );
}
