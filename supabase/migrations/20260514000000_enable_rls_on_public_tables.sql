-- Enable Row-Level Security on every public-schema table.
--
-- Background:
--   The Next.js app reads/writes these tables exclusively from API routes using
--   SUPABASE_SERVICE_ROLE_KEY (see catlog/lib/supabaseAdmin.ts). The service
--   role bypasses RLS, so enabling RLS without any policy does NOT affect
--   server-side access.
--
--   With RLS disabled, anyone holding NEXT_PUBLIC_SUPABASE_ANON_KEY (which is
--   bundled into the public JS) can call the Supabase REST API directly and
--   read / update / delete every row. Supabase Security Advisor flagged this
--   as rls_disabled_in_public / sensitive_columns_exposed.
--
-- Effect:
--   RLS = on + zero policies => anon and authenticated roles get nothing.
--   service_role continues to have full access. App functionality unchanged.

alter table public.cat_profile         enable row level security;
alter table public.cat_foods           enable row level security;
alter table public.cat_meals           enable row level security;
alter table public.cat_weights         enable row level security;
alter table public.cat_elims           enable row level security;
alter table public.cat_medical_records enable row level security;
alter table public.meal_sets           enable row level security;
alter table public.meal_set_items      enable row level security;
