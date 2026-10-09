# Plan: Make LememCon Games stateful with a Hono API on api.lememcon.com

> **Decision update (#38):** the original plan below built on Netlify DB, Netlify Functions
> and Netlify Identity. That is superseded. The SPA stays on Netlify at
> `games.lememcon.com`; the backend is the Hono server in `server/` (PostgreSQL, Better Auth
> with Discord), built from the `Dockerfile` and served API-only at `api.lememcon.com`. The
> cost research is kept as history. The follow-up code gaps are listed under "Follow-up code
> gaps" and are not done yet.

## Context

`games.lememcon.com` is today a **pure static SPA** (React 19 + Vite + Mantine, deployed on
Netlify). It is entirely read-only:

- Score data is fetched at runtime from an **external** feed
  `https://data.lememcon.com/{year}.json` (`src/hooks/useData.ts:23`).
- Game metadata (player counts, cover art) is **bundled** as `src/assets/games.json`
  (48KB), refreshed by `update.cjs` (`pnpm update`) which hits the BGG XML API and commits
  back to the repo.
- All interactive state — selected `year`, `players` filter, `hidePlayed` toggle, and
  per-game **play counts** — lived only in each browser's `localStorage`
  (`src/hooks/useLocalState.ts`, `src/hooks/usePlayedCounts.ts`). Play counts have since moved
  to the database, per member (`played_count`, `/api/me/played`).

There is no backend, no database, no auth, and no way to write data from the SPA (a
`server/` API now exists and the SPA calls it for play counts, auth and admin). **Goal:** turn it into a
stateful full-stack app where Postgres behind a Hono API is the source of truth for scores,
game metadata, shared play counts, and per-user preferences, with in-app admin forms
(Discord login via Better Auth) to create/edit data — while keeping the
app's existing behavior and CI quality gate (`pnpm check`, 90% coverage) intact.

Owner decisions: move **all four** data domains to Postgres; add **in-app admin forms**;
auth via **Better Auth with Discord** (originally Netlify Identity).

---

## Cost research (history, superseded)

_Written for Netlify DB + Functions, which are no longer the plan. Kept for reference; the
backend host is now unspecified; the database is PostgreSQL._

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
Browser SPA (games.lememcon.com, Netlify)
   │  fetch https://api.lememcon.com/api/*  (credentials: "include")
   ▼
Hono server (server/, container from the Dockerfile) ── Better Auth (Discord OAuth)
   │  Drizzle ORM
   ▼
PostgreSQL
```

- The SPA and `src/lib/games.ts` stay as they are. Netlify keeps building and serving the
  static SPA from `main`; for the primary topology `netlify.toml` and `public/_redirects` are
  SPA-only and unchanged.
- The backend is the Hono server already in `server/`, run from the `Dockerfile` on any
  container host behind TLS and served at `api.lememcon.com`. It is API-only; the SPA does
  not need to be served from it.
- Auth is Better Auth with Discord login; roles are `anonymous`, `user` and `admin`
  (`ADMIN_DISCORD_IDS`). Sessions and data live in PostgreSQL via Drizzle (schema in
  `server/db/schema.ts`, migrations in `drizzle/`, applied automatically at container start by
  `node dist-server/migrate.js`, which runs before the server).
- The SPA and API are different origins on the same site. A host-only session cookie on
  `api.lememcon.com` with `credentials: "include"` should work; a `.lememcon.com` cookie
  domain is only needed if that proves insufficient.
- Alternative: a Netlify rewrite of `/api/*` to the API host makes the browser see one
  origin and avoids the CSRF/CORS/cookie work. With it `BETTER_AUTH_URL` and the Discord
  redirect URI stay `https://games.lememcon.com`. It needs a
  `/api/*  https://api.lememcon.com/api/:splat  200` rule placed before the SPA fallback in
  `public/_redirects`. Do not mix the two topologies.

### Data model

The domains from the original plan still apply, now as Drizzle tables in `server/db/`
(only the auth/session tables exist today):

- `scores` (replaces the external feed): surrogate `id`, `UNIQUE (year, bgg_id, player)`.
- `game_metadata` (replaces `games.json`): `bgg_id` PK, player bounds, image `ext`.
- `played_counts`: global per `(year, bgg_id)`; inc/dec as one atomic
  `INSERT ... ON CONFLICT DO UPDATE`. **Superseded** by `played_count`, per member:
  `(discord_id, year, bgg_id)` with the absolute count, set through `PUT /api/me/played/:year/:bggId`.
- `user_prefs`: per user, `year`, `players`, `hide_played`.

### API surface (Hono, `server/app.ts`)

Existing: `GET /healthz`, `GET /api/me`, `GET /api/admin/ping`, `/api/auth/*`. Planned:
public reads (`/api/scores?year=`, `/api/games`, `/api/played-counts?year=`), user writes
(`/api/played-counts`, `/api/prefs`) and admin writes (`/api/scores`, `/api/games`), using the
existing `requireUser`/`requireAdmin` middleware.

### Client changes

Unchanged in intent: `useData` points at the API and keeps the `{ player_game_scores }`
shape and ramda grouping; `usePlayedCounts` becomes API-backed with optimistic updates and
a localStorage fallback; prefs back onto `/api/prefs` when logged in; login UI and a guarded
`/admin` route use Better Auth's client instead of Netlify Identity. The SPA needs an API
base URL and `credentials: "include"` on its calls.

### Follow-up code gaps (not done yet)

| Area                            | Gap                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/middleware.ts` CSRF     | Accepts `Sec-Fetch-Site` `same-origin`/`none`, or (header absent) `Origin` equal to `BETTER_AUTH_URL`; browsers always send it, so POSTs from games.lememcon.com to api.lememcon.com get a 403. |
| CORS                            | None yet; needs `cors()` with the web origin, credentials and preflight on `/api/*`.                                                                                                            |
| `server/auth.ts`                | `trustedOrigins` lacks the web origin; cookie domain `.lememcon.com` only if needed.                                                                                                            |
| `server/env.ts`, `.env.example` | Add and validate `WEB_ORIGIN`.                                                                                                                                                                  |
| `vite.config.ts`                | Add `server.proxy` for `/api` to :8080 so local dev is same-origin.                                                                                                                             |
| SPA                             | No `/api` calls exist yet; add API base URL and `credentials: "include"`.                                                                                                                       |

### Data migration / seed

- One-time standalone seed script (not a request handler) pulls each historical
  `https://data.lememcon.com/{year}.json` into `scores` and loads `src/assets/games.json`
  into `game_metadata`, with `ON CONFLICT` upserts so it is re-runnable.
- `update.cjs` BGG enrichment is repurposed to upsert into `game_metadata`; it stays a
  script because of its throttled batches.
- Cover images stay bundled for now: `buildSelectedGames` resolves art by `id + ext`, so
  moving metadata to the DB does not require moving image files.

### Testing

Keep `pnpm check` and the 90% coverage gate green. Server logic is covered by the `server`
Vitest project with injected dependencies (fake session resolver, fake `Db`), so no
PostgreSQL or network is needed; keep SQL shaping and validation in testable functions and
handlers thin. Hooks are tested by mocking `fetch`.

### Local dev

- `pnpm dev` (Vite, :3000) and `pnpm server:dev` (API, :8080) with a local PostgreSQL
  (`.env.example`). These are different origins on the same site, so POSTs hit the same CSRF
  403 as production until the gaps above are fixed. The planned option is a Vite
  `server.proxy` for `/api`, which makes local calls same-origin.

---

## Phased rollout (each phase ships independently)

- **Phase 0 - infra**: deploy the container and Postgres behind `api.lememcon.com`, run
  migrations, seed existing scores and `games.json`. No app behavior change.
- **Phase 0.5 - cross-origin**: the CSRF, CORS, `trustedOrigins` and `WEB_ORIGIN` gaps above.
- **Phase A - read-path swap**: point `useData` at `/api/scores`, add `useGames`; retire the
  external feed and bundled `games.json`.
- **Phase B - play counts**: done differently: per-member `played_count` table and
  `/api/me/played` endpoints; API-backed hook with optimistic update, no localStorage
  fallback (superseding the global `played_counts` sketch).
- **Phase C - login and per-user prefs**: Discord login UI, `user_prefs`, `/api/prefs`.
- **Phase D - admin forms**: guarded `/admin` route, admin write endpoints; repurpose
  `update.cjs` to write metadata to the DB.

Risk points:

1. **Cross-origin auth** - CSRF, CORS and cookies must be sorted before any SPA write.
2. **Cold start / latency** - the SPA's loading skeleton absorbs the first request, but the
   API host and database should be sized to avoid slow wake-ups.
3. **Played-count write auth** - public (frictionless) vs. require login (prevents abuse of a
   durable global write). Product call; reads stay public either way.
4. **Complete historical backfill** - seed every year's feed, not just the current one.
5. **Migrations on deploy** - run automatically at container start (`migrate.js` before the
   server, under a Postgres advisory lock). A failed migration fails the start, and the old
   release keeps running, so migrations must stay backward compatible with it.

---

## Verification

- **Local**: API and Postgres up; `curl localhost:8080/healthz` is ok; the SPA renders
  identically against the API. Log in via Discord; inc/dec a play count and confirm it
  persists across a reload and a second browser. As admin, add/edit/delete a score; as
  non-admin, confirm write endpoints are rejected.
- **CI**: `pnpm check` and `pnpm test:coverage` pass.
- **Deploy**: `GET https://api.lememcon.com/healthz` is ok, the Netlify SPA loads, and
  cross-origin calls with credentials succeed once the gaps are fixed.

## Sources

- (Superseded) Netlify DB overview & billing: https://docs.netlify.com/build/data-and-storage/netlify-database/ and /billing-and-usage/
- Netlify Functions usage/billing: https://docs.netlify.com/build/functions/usage-and-billing/
- Netlify pricing: https://www.netlify.com/pricing/
- Neon pricing (free tier, autosuspend, Launch rates): https://neon.com/pricing
- Netlify Identity status (Feb 2026 reversal) + Auth0 alternative: https://www.netlify.com/blog/auth0-extension-identity-changes/
