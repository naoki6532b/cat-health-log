export const DEFAULT_RECENT_MEAL_LOG_DAYS = 7;
export const MAX_RECENT_MEAL_LOG_DAYS = 365;

export function normalizeRecentMealLogDays(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= MAX_RECENT_MEAL_LOG_DAYS
    ? parsed
    : DEFAULT_RECENT_MEAL_LOG_DAYS;
}
