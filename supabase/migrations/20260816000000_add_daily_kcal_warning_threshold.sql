-- 猫ごとの1日あたり実食カロリー警告基準。
-- 既存の猫にはデフォルトの 240 kcal を適用する。

alter table public.cats
  add column if not exists daily_kcal_warning_threshold numeric(8, 2)
  not null default 240;

alter table public.cats
  drop constraint if exists cats_daily_kcal_warning_threshold_check;

alter table public.cats
  add constraint cats_daily_kcal_warning_threshold_check
  check (daily_kcal_warning_threshold > 0);
