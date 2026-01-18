# Cat Health Log - AI Coding Instructions

## Project Overview
**Cat Health Log** is a Next.js 16 + Supabase web app (in `/catlog`) for tracking cat health data: meals, elimination logs, food inventory, and health summaries. The app uses client-side PIN authentication for data access.

## Architecture & Data Flow

### Tech Stack
- **Frontend**: Next.js 16 (React 19), Tailwind CSS, TypeScript
- **Backend**: Next.js API routes + Supabase (PostgreSQL)
- **Key Deps**: `@supabase/supabase-js`, `lucide-react` (icons), `tailwind-merge`

### Authentication Pattern
The app implements custom PIN-based protection (NOT OAuth):
- **Client**: [`lib/api.ts`](lib/api.ts) stores PIN in localStorage under key `catlog_pin`
- **Server**: [`app/api/_pin.ts`](app/api/_pin.ts) validates PIN from `x-catlog-pin` header against `CATLOG_PIN` env var
- **Usage**: Wrap API GETs/POSTs with `checkPin(req)` to verify. Example: [`app/api/foods/route.ts`](app/api/foods/route.ts#L4)
- **No PIN endpoints** (e.g., meals/recent retrieval) omit `checkPin()` to allow public read

### Data Models
Supabase tables managed server-side via `supabaseAdmin` (service role):
- `cat_meals` - meal entries (id, dt, food_id, grams, leftover_g, kcal, meal_group_id)
- `cat_foods` - food registry (id, food_name, food_type, kcal_per_g, package_g, package_kcal)
- `cat_elims` - elimination logs

### API Route Pattern
All routes in [`app/api/`](app/api/) use:
1. Export `GET`/`POST`/`DELETE` handlers (no middleware pattern)
2. Always use `supabaseAdmin` for DB (service role key)
3. Apply `checkPin()` early if route requires auth
4. Return `NextResponse.json()` or `Response.json()`
5. Example computed fields: `kcal` derived from `grams * kcal_per_g` (see meals POST logic)

### Client Patterns
- **Pages**: `app/[feature]/page.tsx` (e.g., `/entry/meal`, `/foods`, `/summary`)
- **Components**: Reusable UI in [`components/`](components/) + Tailwind badge/button/card UI helpers
- **Data Fetching**: `apiFetch()` adds PIN header automatically; no fetch() calls directly
- **Form State**: Controlled React state with string coercion for selects (`<select value={String(id)}>`)

## Developer Workflows

### Setup & Running
```bash
cd catlog
npm install
npm run dev  # Runs on :3000 by default
# For env: .env.local needs CATLOG_PIN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### Build & Lint
```bash
npm run build
npm run lint  # ESLint (config: eslint.config.mjs)
```

### Adding a New Feature
1. **API route**: Create [`app/api/[resource]/route.ts`](app/api/) with GET/POST/DELETE handlers
2. **Page**: Create [`app/[feature]/page.tsx`](app/), mark with `"use client"` if interactive
3. **UI**: Reuse badge/button/card from [`components/ui/`](components/ui/); style with Tailwind
4. **PIN check**: Wrap admin-only routes with `checkPin()` call at handler start

## Project-Specific Conventions

### Error Handling
- **Server**: Return `NextResponse.json({ error: "message" }, { status: 400|403|500 })`
- **Client**: `apiFetch()` throws on non-ok response; wrap calls in try/catch
- **Example**: [`entry/meal/page.tsx`](app/entry/meal/page.tsx) catches submission errors and shows via `setMsg()`

### Type Coercion
- Food/meal IDs stored as numbers in DB but passed as strings in form selects
- Always use `String(id)` for select value matching and `Number()` when querying
- See [`entry/meal/page.tsx`](app/entry/meal/page.tsx#L31-L32) for pattern

### Time Handling
- Meal timestamps stored as ISO strings (`dt: '2025-01-18T12:30:00'`)
- Client converts to local datetime-local format via `toDatetimeLocal()` util
- Batch meals group by `meal_group_id` on server (15-min sessions)

### Type Safety
- `strict: true` in tsconfig.json; all route handlers and components must be fully typed
- Use explicit response types: `Response | NextResponse | undefined`
- Query results cast to proper shape: `const { data, error } = await supabaseAdmin.from(...).select(...)`

## Key Files & Patterns

| File | Purpose |
|------|---------|
| [lib/api.ts](lib/api.ts) | PIN fetching, `apiFetch()` wrapper |
| [app/api/_pin.ts](app/api/_pin.ts) | PIN validation middleware |
| [app/layout.tsx](app/layout.tsx) | Root layout with navigation (Japanese labels) |
| [app/entry/meal/page.tsx](app/entry/meal/page.tsx) | Meal logging UI; shows kcal calculation pattern |
| [app/api/meals/route.ts](app/api/meals/route.ts) | Meal CRUD; shows computed fields & batch logic |
| [lib/supabaseAdmin.ts](lib/supabaseAdmin.ts) | Service role client initialization |

## Common Tasks

**Add new food**:
- POST `/api/foods` with `{ food_name, kcal_per_g, food_type?, package_g?, package_kcal? }` (requires PIN)

**Log meal**:
- POST `/api/meals` with `{ dt, items: [{ food_id, grams, leftover_g?, note? }], meal_group_id? }` (no PIN)

**Add elimination log**:
- POST `/api/elims` with `{ dt, type, note? }` (no PIN, mirrors meal pattern)

**Query recent meals**:
- GET `/api/meals/recent?limit=5` returns last N meals (no PIN); used by RecentMeals component

---

## Notes for AI Agents
- **Navigation labels are in Japanese** - preserve them when updating layout or nav menus
- **PIN is shared, not per-user** - client-side only; no user concept yet
- **Computed fields**: Always recalculate `kcal = grams * kcal_per_g` at insertion time for consistency
- **Meal grouping**: `meal_group_id` clusters items within 15-min windows server-side; trust existing logic
