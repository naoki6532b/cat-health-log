-- 猫ごとの体重・排泄記録の警告日数。
-- 既存の猫には、体重10日・うんち2日・おしっこ2日を適用する。

alter table public.cats
  add column if not exists weight_warning_days integer not null default 10,
  add column if not exists stool_warning_days integer not null default 2,
  add column if not exists urine_warning_days integer not null default 2;

alter table public.cats
  drop constraint if exists cats_weight_warning_days_check,
  drop constraint if exists cats_stool_warning_days_check,
  drop constraint if exists cats_urine_warning_days_check;

alter table public.cats
  add constraint cats_weight_warning_days_check
    check (weight_warning_days between 1 and 3650),
  add constraint cats_stool_warning_days_check
    check (stool_warning_days between 1 and 3650),
  add constraint cats_urine_warning_days_check
    check (urine_warning_days between 1 and 3650);
