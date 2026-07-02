-- Family accounts + multi-cat support.
--
-- 前提:
--   このマイグレーションを流す前に、Supabase ダッシュボード
--   (Authentication > Users > Add user) で naoki6532@gmail.com の
--   アカウントを作成しておくこと。既存データはこのアカウントの
--   「マフユ」に紐づけられる。
--
-- 内容:
--   1. cats テーブル新設(1アカウント=1家族が複数の猫を持てる)
--   2. cat_profile の内容を cats(マフユ) として移行し、cat_profile を廃止
--   3. 記録系テーブル(meals/weights/elims/medical)に cat_id を追加して backfill
--   4. cat_foods / meal_sets は家族アカウント単位(user_id)で共有
--   5. 「自分の家族のデータだけ読み書きできる」RLS ポリシーを全テーブルに設定
--      (サービスロールでの素通しをやめ、DB層で認可を強制する)

-- 1. cats ------------------------------------------------------------------

create table public.cats (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  birthday   date,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cats_user_id_idx on public.cats (user_id);

-- 2. cat_id カラム追加 ------------------------------------------------------

alter table public.cat_meals           add column cat_id bigint references public.cats (id) on delete cascade;
alter table public.cat_weights         add column cat_id bigint references public.cats (id) on delete cascade;
alter table public.cat_elims           add column cat_id bigint references public.cats (id) on delete cascade;
alter table public.cat_medical_records add column cat_id bigint references public.cats (id) on delete cascade;

create index cat_meals_cat_id_idx           on public.cat_meals (cat_id);
create index cat_weights_cat_id_idx         on public.cat_weights (cat_id);
create index cat_elims_cat_id_idx           on public.cat_elims (cat_id);
create index cat_medical_records_cat_id_idx on public.cat_medical_records (cat_id);

-- 3. 既存データの移行 --------------------------------------------------------

do $$
declare
  v_user_id uuid;
  v_cat_id  bigint;
  v_name    text;
  v_birth   date;
  v_photo   text;
begin
  select id into v_user_id from auth.users where email = 'naoki6532@gmail.com';
  if v_user_id is null then
    raise exception 'naoki6532@gmail.com のユーザーが見つかりません。先に Supabase ダッシュボードでアカウントを作成してください。';
  end if;

  -- cat_profile(単一猫)→ cats(マフユ)
  select
    nullif(trim(cat_name), ''),
    nullif(trim(birthday::text), '')::date,
    photo_path
  into v_name, v_birth, v_photo
  from public.cat_profile
  where id = 1;

  insert into public.cats (user_id, name, birthday, photo_path)
  values (v_user_id, coalesce(v_name, 'マフユ'), v_birth, v_photo)
  returning id into v_cat_id;

  -- 全記録をマフユに紐づけ
  update public.cat_meals           set cat_id = v_cat_id where cat_id is null;
  update public.cat_weights         set cat_id = v_cat_id where cat_id is null;
  update public.cat_elims           set cat_id = v_cat_id where cat_id is null;
  update public.cat_medical_records set cat_id = v_cat_id where cat_id is null;

  -- フード・ミールセットは家族アカウント単位
  update public.cat_foods set user_id = v_user_id where user_id is null;
  update public.meal_sets set user_id = v_user_id where user_id is null;
end $$;

alter table public.cat_meals           alter column cat_id set not null;
alter table public.cat_weights         alter column cat_id set not null;
alter table public.cat_elims           alter column cat_id set not null;
alter table public.cat_medical_records alter column cat_id set not null;

-- 新規行はログイン中ユーザーに自動で紐づく
alter table public.cat_foods alter column user_id set default auth.uid();
alter table public.cat_foods alter column user_id set not null;
alter table public.meal_sets alter column user_id set default auth.uid();
alter table public.meal_sets alter column user_id set not null;

-- cat_profile は cats に置き換えたので廃止
drop table public.cat_profile;

-- 4. RLS ポリシー ------------------------------------------------------------
-- 方針: 認証済みユーザーは「自分(=家族アカウント)の猫」のデータのみ全操作可。
--       anon には一切ポリシーを与えない(何も見えない)。

alter table public.cats enable row level security;

create policy "own cats" on public.cats
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own cat meals" on public.cat_meals
  for all to authenticated
  using (cat_id in (select id from public.cats where user_id = (select auth.uid())))
  with check (cat_id in (select id from public.cats where user_id = (select auth.uid())));

create policy "own cat weights" on public.cat_weights
  for all to authenticated
  using (cat_id in (select id from public.cats where user_id = (select auth.uid())))
  with check (cat_id in (select id from public.cats where user_id = (select auth.uid())));

create policy "own cat elims" on public.cat_elims
  for all to authenticated
  using (cat_id in (select id from public.cats where user_id = (select auth.uid())))
  with check (cat_id in (select id from public.cats where user_id = (select auth.uid())));

create policy "own cat medical records" on public.cat_medical_records
  for all to authenticated
  using (cat_id in (select id from public.cats where user_id = (select auth.uid())))
  with check (cat_id in (select id from public.cats where user_id = (select auth.uid())));

create policy "own foods" on public.cat_foods
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own meal sets" on public.meal_sets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own meal set items" on public.meal_set_items
  for all to authenticated
  using (set_id in (select id from public.meal_sets where user_id = (select auth.uid())))
  with check (set_id in (select id from public.meal_sets where user_id = (select auth.uid())));
