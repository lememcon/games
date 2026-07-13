# Plan: Make LememCon Games stateful with Netlify DB + Functions

## Context

`games.lememcon.com` is today a **pure static SPA** (React 19 + Vite + Mantine, deployed on
Netlify). It is entirely read-only:

- Score data is fetched at runtime from an **external** feed
  `https://data.lememcon.com/{year}.json` (`src/hooks/useData.ts:23`).
- Game metadata (player counts, cover art) is **bundled** as `src/assets/games.json`
  (48KB), refreshed by `update.cjs` (`pnpm update`) which hits the BGG XML API and commits
  back to the repo.
- All interactive state — selected `year`, `players` filter, `hidePlayed` toggle, and
  per-game **play counts** — lives only in each browser's `localStorage`
  (`src/hooks/useLocalState.ts`, `src/hooks/usePlayedCounts.ts`).

There is no backend, no database, no functions, no auth, and no way to write data from the
app. **Goal:** turn it into a stateful full-stack app on Netlify where Postgres is the
source of truth for scores, game metadata, shared play counts, and per-user preferences,
with in-app admin forms (Netlify Identity auth) to create/edit data — while keeping the
app's existing behavior and CI quality gate (`pnpm check`, 90% coverage) intact.

Owner decisions: move **all four** data domains to Postgres; add **in-app admin forms**;
auth via **Netlify Identity**.

---

## Cost research (the headline answer)

**For a VERY low-use site this is effectively $0/month, and at worst a couple of dollars.**

Why — the two things that could cost money both scale to (nearly) zero at low traffic:

### Netlify DB (Postgres, powered by Neon)

- **Auto-suspends after 5 min idle** (scale-to-zero). You are billed for _compute active
  time_ (CU-hours), not for existing. A sleeping DB costs nothing.
- **Free plan allowance: ~48 database compute-units/billing period + 5 GB storage + 5 GB
  egress.** Storage is **free for everyone until July 1, 2026**; after that a tiny DB (this
  data is well under 50 MB) is pennies.
- What "very low use" actually consumes: cost is driven by the number of distinct ~5-min
  active windows, not query count. A handful of visits/day keeps you inside the free 48
  CU-hours. The only way to blow past free is _sparse_ traffic spread so thin that every
  visit is an isolated 5-min wake — even then it's ~dozens of CU-hours.
- If you ever exceed free, Neon **Launch** is **$0.106/CU-hour** and **$0.35/GB-month**, no
  monthly minimum. Realistic low-use overage: **~$1–3/month**.

### Netlify Functions

- Billed from the Free plan's shared **300 credits/month** pool. Rates: **web requests 2
  credits / 10K requests**, **function compute 10 credits / GB-hour**, bandwidth 20
  credits/GB.
- A very-low-use site (say ~1K–10K function hits/month, each a few hundred ms at 1 GB) uses
  **a rounding-error fraction of one credit** for compute and ≤2 credits for requests.
  **Effectively free.**
- Free plan hard-stops at the limit (pauses until next cycle) — it never surprise-charges.
- Function timeout on Free is **10s** (irrelevant here; queries are milliseconds).

### Bottom line

| Scenario                        | Netlify DB                      | Functions                     | Monthly   |
| ------------------------------- | ------------------------------- | ----------------------------- | --------- |
| Very low use (hobby traffic)    | Free (48 CU-hrs, auto-suspend)  | Free (well under 300 credits) | **$0**    |
| Post-July-2026 storage, tiny DB | ~$0.02–0.20 storage             | Free                          | **≈ $0**  |
| Pathologically sparse traffic   | maybe exceed free → Neon Launch | Free                          | **~$1–3** |

Caveat: this is Netlify's current **credit-based** plan (accounts created after Sep 2025).
Verify which plan this Netlify account is on; legacy plans meter functions by request count
instead. Sources listed at the bottom.

---

## Recommended architecture

```
Browser SPA  ──fetch──▶  /api/*  (netlify.toml redirect)  ──▶  netlify/functions/*
   │                                                              │
   │  netlify-identity-widget (JWT)                               │  @netlify/neon (NETLIFY_DATABASE_URL)
   ▼                                                              ▼
Identity user id ──────────────────────────────────────▶   Netlify DB (Postgres/Neon)
```

- Keep the SPA + pure transforms in `src/lib/games.ts` exactly as-is. Only the **data
  source** changes (feed → `/api/...`), plus new auth + admin UI.
- Functions live in `netlify/functions/`; route them at `/api/*` via a redirect so the
  client uses clean same-origin URLs (also removes the current cross-origin fetch to
  `data.lememcon.com`). **Ordering caveat:** the existing SPA fallback `/* → /index.html`
  lives in `public/_redirects`, which Netlify evaluates _before_ `netlify.toml` redirects —
  so it would swallow `/api/*`. Put the `/api/*` rule **above** the `/*` line (consolidate
  both redirects into one ordered source). Shared function code goes in `_`-prefixed files
  (e.g. `netlify/functions/_lib/`), which Netlify's router ignores.
- DB access via `@netlify/neon` reading `NETLIFY_DATABASE_URL`. Schema + migrations tracked
  in-repo (Drizzle ORM for type-safe schema and migrations that apply on deploy).

### Database schema (Drizzle in `netlify/database/schema.ts`, migrations in `netlify/database/migrations/`)

- **`scores`** — replaces the external feed. Surrogate `id` PK (clean admin edit/delete) +
  **`UNIQUE (year, bgg_id, player)`** natural key for upserts/dupe-prevention. `year smallint`,
  `bgg_id int`, `game text`, `player text`, `score int`, `rank int`, `updated_at`. Index
  `(year)` and `(year, bgg_id)`.
- **`game_metadata`** — replaces `games.json`. `bgg_id int PK`, `min_players int`,
  `max_players int`, `image text`, `ext text`, `updated_at`.
- **`played_counts`** — shared counts. Model: **global per (year, bgg_id)** count
  (`year smallint`, `bgg_id int`, `count int`, PK `(year, bgg_id)`) since owner chose "shared".
  inc/dec is a single **atomic** `INSERT … ON CONFLICT (year,bgg_id) DO UPDATE SET count =
count ± 1` — no read-modify-write race under concurrent clients + Neon scale-to-zero.
- **`user_prefs`** — per Identity user. `user_id text PK`, `year text`, `players jsonb`,
  `hide_played bool`, `updated_at`.

### API surface (`netlify/functions/`, exposed at `/api/*`)

| Endpoint                   | Method   | Auth      | Purpose                                                                                  |
| -------------------------- | -------- | --------- | ---------------------------------------------------------------------------------------- |
| `/api/scores?year=`        | GET      | public    | Rows for a year → `{ player_game_scores: [...] }` (same shape `useData` already expects) |
| `/api/games`               | GET      | public    | All game metadata → `GamesData` map                                                      |
| `/api/played-counts?year=` | GET      | public    | Shared counts for a year                                                                 |
| `/api/played-counts`       | POST     | **user**  | inc/dec a `(year,bgg_id)` count                                                          |
| `/api/prefs`               | GET      | **user**  | current user's saved prefs                                                               |
| `/api/prefs`               | PUT      | **user**  | save current user's prefs                                                                |
| `/api/scores`              | POST/PUT | **admin** | upsert a score row                                                                       |
| `/api/scores/:id`          | DELETE   | **admin** | delete a score row                                                                       |
| `/api/games`               | POST/PUT | **admin** | upsert game metadata                                                                     |

Auth in functions: read the Identity user from `context.clientContext.user` (the widget
sends the JWT). "admin" = presence of an `admin` role on the Identity user (set via the
Identity dashboard / a signup webhook). Public GETs stay open.

### Client changes

- `src/hooks/useData.ts`: change only `url` to `/api/scores?year=${year}`. **Keep the exact
  ramda grouping** (`by_id`/`by_game`/`by_player`, `max`) and the `{ player_game_scores }`
  response shape — zero downstream churn.
- `src/App.tsx`: game metadata comes from `/api/games` (via a small `useGames` hook)
  instead of `import games.json`. The `import.meta.glob` cover-image approach is replaced by
  serving `image_url` from the DB (images move out of the bundle — see migration).
- `src/hooks/usePlayedCounts.ts`: swap the `useLocalState` backing for an API-backed hook
  (`GET /api/played-counts`, `POST` on inc/dec) with **optimistic updates** and a
  localStorage fallback when logged-out/offline. Keep the same `[get, inc, dec, counts]`
  signature so `App.tsx`/`GamesList` don't change.
- Preferences (`year`, `players`, `hidePlayed`): when logged in, back them with
  `/api/prefs` (load on login, debounced `PUT` on change); when logged out, keep current
  `useLocalState` behavior. A tiny `usePrefs` hook hides the branch.
- Auth UI: mount `netlify-identity-widget` (login/logout button in `Header`). Add a guarded
  admin route via wouter (e.g. `/admin`) rendering the new form components; redirect
  non-admins.
- New components (each with a colocated `*.test.tsx`): `LoginButton`, `AdminScores`
  (table + add/edit/delete form), `AdminGames` (metadata editor). Keep all non-trivial
  computation in `src/lib/` pure functions to stay testable under the coverage gate.

### Data migration / seed

- One-time **standalone seed script** (`scripts/seed.ts`, run via `pnpm seed` against
  `NETLIFY_DATABASE_URL`) — **not** a function, so it dodges the 10s free-plan function
  timeout on a multi-year backfill. It pulls each historical
  `https://data.lememcon.com/{year}.json` into `scores` and loads current
  `src/assets/games.json` into `game_metadata`. All inserts use `ON CONFLICT` upserts so it's
  idempotent/re-runnable. (Optionally also expose a small admin `POST /api/seed` for
  convenience re-seeds of a single year.)
- `update.cjs` BGG enrichment is repurposed to **upsert into `game_metadata`** (reads
  `SELECT DISTINCT bgg_id FROM scores` lacking metadata) instead of committing `games.json`.
  Keep it a **script** (its 20-id batches with 5s throttles would blow the 10s function
  limit), now needing `NETLIFY_DATABASE_URL`.
- **Cover images stay bundled for now.** `buildSelectedGames` resolves art from the eager
  `import.meta.glob("@/assets/games/*")` map keyed by `id + ext`, so as long as the metadata
  API still returns `ext`, the existing image resolution keeps working unchanged — moving
  metadata to the DB does **not** require moving image files. (Migrating image serving to
  Netlify Blobs/CDN is a later, optional step.)

### Testing (keep `pnpm check` + 90% coverage green)

- Hooks: mock `fetch`/the api client; assert `useData` still produces the same grouped
  `Data` from a `{ player_game_scores }` fixture; assert optimistic inc/dec in
  `usePlayedCounts`.
- Functions: the coverage gate's `include` is **`src/**/*.{ts,tsx}` only**
  (`vite.config.ts:25`), so code under `netlify/functions/` is **not** measured by the 90%
  gate. Recommended (matches the project's "keep logic out of components / in pure functions"
  convention): put all testable logic — SQL shaping, validation, the Identity role/admin
  check, request parsing — in **pure helpers under `src/lib/`** (e.g. `src/lib/api.ts`,
  `src/lib/auth.ts`) with colocated tests, and keep `netlify/functions/*` handlers as **thin
  adapters** that just wire request → helper → db. This keeps meaningful coverage without a
  live DB. (Alternative: extend coverage `include` to `netlify/**` and mock the db client —
  more friction.)
- Mantine jsdom shims already exist in `src/test/setup.ts`; add shims only if a new
  component needs a missing browser API.
- **`netlify/` is outside `src`**, so it's invisible to `pnpm typecheck` (`tsconfig` includes
  `src` only) **and** ESLint's browser-globals config. To avoid shipping functions
  untyped/unlinted: add `netlify/tsconfig.json` (extends base, `types:["node"]`) and append
  `tsc --noEmit -p netlify/tsconfig.json` to the `typecheck` script; add an ESLint override for
  `netlify/**` with node globals; add a separate vitest project for `netlify/**/*.test.ts`
  (node env, mocked db client) with its own looser threshold. Recommendation: keep the strict
  90% gate on `src/` and a **separate, looser** gate on `netlify/` (holding serverless+DB code
  to 90% via mocking is high-friction). `pnpm check` grows to: lint → pretty → typecheck
  (src + node + netlify) → test:run (src, 90%) → test:netlify (functions) → build.

### Local dev

- `netlify dev` runs functions + a local Postgres and injects `NETLIFY_DATABASE_URL`.
- `netlify database init` provisions the DB and wires the env var; add `@netlify/neon`,
  `drizzle-orm`, `drizzle-kit`, `netlify-identity-widget`, and `@netlify/functions` (types)
  to `package.json`.

---

## Phased rollout (each phase ships independently)

- **Phase 0 — infra**: `netlify database init`, add deps, Drizzle schema + first migration,
  seed script loads existing scores + games.json into Postgres. No app behavior change yet.
- **Phase A — read-path swap (smallest shippable slice)**: point `useData` at
  `/api/scores`, add `useGames` → `/api/games`. App looks identical; external feed +
  bundled `games.json` retired. Lowest risk, delivers "DB is source of truth."
- **Phase B — shared play counts**: `played_counts` table + GET/POST functions; convert
  `usePlayedCounts` to API-backed with optimistic update + localStorage fallback.
- **Phase C — auth + per-user prefs**: mount Identity widget, `user_prefs` table, `/api/prefs`
  GET/PUT, `usePrefs` hook; logged-out users keep localStorage.
- **Phase D — admin forms**: guarded `/admin` route, `AdminScores`/`AdminGames` components,
  admin-only write endpoints; repurpose `update.cjs` to write metadata to the DB.

Risk points:

1. **Redirect ordering** — `/api/*` must precede the `/*` SPA fallback or it gets swallowed.
2. **`netlify/` tooling scope** — outside `pnpm typecheck`/ESLint/coverage; needs its own
   tsconfig, ESLint node-globals override, and vitest project (don't ship it untyped/untested).
3. **Neon cold start** — first request after 5-min idle is slow; the existing `loading`
   skeleton absorbs it, but it's user-visible on the leaderboard.
4. **Played-count write auth** — public (frictionless, matches today) vs. require login
   (prevents abuse of a now-durable global write). Product call; reads stay public either way.
5. **Identity role/admin gating** — owner must assign an `admin` role in Identity; fall back
   to "any authenticated user" until roles are set up. GoTrue is maintenance-mode, so keep
   auth behind a thin `src/lib/identity.ts` seam so a swap to the Auth0 extension is one file.
6. **Function 10s timeout / shared credits** — keep bulk seed + BGG enrichment as scripts.
7. **Complete historical backfill** — seed every year's feed, not just the current one.

---

## Verification

- **Local**: `netlify dev` up; `curl /api/scores?year=2026` returns the `{ player_game_scores }`
  shape; the SPA renders identically to today against the DB. Log in via Identity; inc/dec a
  play count and confirm it persists across a reload _and_ a second browser (shared). Save a
  filter pref, reload, confirm it restores from the DB. As admin, add/edit/delete a score and
  see it in the list; as non-admin, confirm `/admin` and write endpoints are rejected.
- **CI**: `pnpm check` passes (lint → prettier → typecheck → vitest ≥90% → build).
- **Deploy preview**: confirm the preview gets its isolated DB branch and migrations apply on
  deploy; smoke-test the preview URL.
- **Cost**: after a week live, check Netlify usage (credits) + Neon CU-hours to confirm the
  $0 projection; set a billing alert.

## Sources

- Netlify DB overview & billing: https://docs.netlify.com/build/data-and-storage/netlify-database/ and /billing-and-usage/
- Netlify Functions usage/billing: https://docs.netlify.com/build/functions/usage-and-billing/
- Netlify pricing: https://www.netlify.com/pricing/
- Neon pricing (free tier, autosuspend, Launch rates): https://neon.com/pricing
- Netlify Identity status (Feb 2026 reversal) + Auth0 alternative: https://www.netlify.com/blog/auth0-extension-identity-changes/
