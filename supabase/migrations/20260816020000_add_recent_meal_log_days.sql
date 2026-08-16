-- 給餌入力画面の「最近の給餌ログ」に表示する日数。
-- 今日を含む直近7日を初期値とする。

alter table public.cats
  add column if not exists recent_meal_log_days integer not null default 7;

alter table public.cats
  drop constraint if exists cats_recent_meal_log_days_check;

alter table public.cats
  add constraint cats_recent_meal_log_days_check
  check (recent_meal_log_days between 1 and 365);
