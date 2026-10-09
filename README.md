# LememCon Games

[![site](https://img.shields.io/netlify/261ad471-fd16-4d17-89b1-43dcc8fd7af4?logo=netlify&logoColor=%23fff&label=site)](https://games.lememcon.com)
[![ci](https://img.shields.io/github/actions/workflow/status/lememcon/games/ci.yml?branch=main&logo=github&logoColor=%23fff&label=ci)](https://github.com/lememcon/games/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/badge/coverage-%E2%89%A590%25-brightgreen)](#testing--quality)
[![license](https://img.shields.io/github/license/lememcon/games?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNNyAyMGwxMCAwIi8%2BPHBhdGggZD0iTTYgNmw2IC0xbDYgMSIvPjxwYXRoIGQ9Ik0xMiAzbDAgMTciLz48cGF0aCBkPSJNOSAxMmwtMyAtNmwtMyA2YTMgMyAwIDAgMCA2IDAiLz48cGF0aCBkPSJNMjEgMTJsLTMgLTZsLTMgNmEzIDMgMCAwIDAgNiAwIi8%2BPC9zdmc%2B&logoColor=%23fff&color=%23750014)](https://github.com/lememcon/games?tab=MIT-1-ov-file#readme)

[![last commit](https://img.shields.io/github/last-commit/lememcon/games?logo=github&logoColor=%23fff)](https://github.com/lememcon/games/commits/main)
[![commit activity](https://img.shields.io/github/commit-activity/m/lememcon/games?logo=github&logoColor=%23fff)](https://github.com/lememcon/games/pulse)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-F7B93E?logo=prettier&logoColor=%23fff)](https://prettier.io)
[![conventional commits](https://img.shields.io/badge/commits-conventional-FE5196?logo=conventionalcommits&logoColor=%23fff)](https://www.conventionalcommits.org)

[![react](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=%23fff)](https://react.dev)
[![vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=%23fff)](https://vite.dev)
[![pnpm](https://img.shields.io/badge/pnpm-managed-F69220?logo=pnpm&logoColor=%23fff)](https://pnpm.io)

A single-page web app for browsing board game scores from LememCon. It pulls
per-player scores for a given year, ranks games by their total score, and lets
you filter the list, view per-game score breakdowns, and track which games
you've already played. Live at **[games.lememcon.com](https://games.lememcon.com)**.

## Features

- **Ranked games table** — games sorted by combined score across the players
  in view.
- **Filter by player** — narrow scores to a subset of players; totals and the
  score-normalizing max rescale to match.
- **Filter by player count** — games whose min/max player counts don't fit the
  current selection are hidden.
- **Played counter** — increment/decrement a per-game play count, persisted in
  `localStorage` per year, with an option to hide games you've played.
- **Year switcher** — pick any imported year; each year is a separate import.
- **Game detail pages** — per-game view with the BoardGameGeek cover image,
  player-count bounds, and a table of every player's rank and score.

State that should survive reloads (selected year, player filter, hide-played
toggle, and play counts) is stored in `localStorage`.

## Tech stack

- **[React 19](https://react.dev/)** + **[Vite 8](https://vite.dev/)** (SWC plugin)
- **[Mantine 8](https://mantine.dev/)** for UI components and theming
- **[wouter](https://github.com/molefrog/wouter)** for routing
- **[ramda](https://ramdajs.com/)** for data transforms
- **[lucide-react](https://lucide.dev/)** for icons
- **[Hono](https://hono.dev/)**, **[Better Auth](https://www.better-auth.com/)** and **[Drizzle ORM](https://orm.drizzle.team/)** (PostgreSQL) for the server
- **[Vitest](https://vitest.dev/)** + **[Testing Library](https://testing-library.com/)** for tests
- **[pnpm](https://pnpm.io/)** as the package manager

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts Vite and opens the app at http://localhost:3000.

### Scripts

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `pnpm dev`           | Start the dev server on port 3000                   |
| `pnpm build`         | Production build to `dist/`                         |
| `pnpm preview`       | Serve the production build locally                  |
| `pnpm test`          | Run Vitest in watch mode                            |
| `pnpm test:run`      | Run tests once                                      |
| `pnpm test:coverage` | Run tests with a V8 coverage report (90% threshold) |
| `pnpm lint`          | ESLint                                              |
| `pnpm pretty`        | Check formatting with Prettier                      |
| `pnpm typecheck`     | Type-check the app and node configs                 |
| `pnpm fix`           | Auto-fix formatting then lint                       |
| `pnpm check`         | Lint, format, typecheck, tests, build, server build |
| `pnpm server:dev`    | Run the server in watch mode (see Backend)          |
| `pnpm server:build`  | Bundle the server to `dist-server/`                 |
| `pnpm server:start`  | Run the compiled server                             |
| `pnpm db:generate`   | Generate a Drizzle migration from the schema        |
| `pnpm db:migrate`    | Apply migrations (needs `pnpm server:build` first)  |
| `pnpm update`        | Refresh game metadata and images (see below)        |

## How it works

### Data flow

Score data is **not** bundled — it comes from the API, which reads PostgreSQL:

- `GET /api/years` lists the imported years, newest first, and
  `GET /api/years/{year}/scores` returns that year's `player_game_scores` rows
  (`bgg_id`, `game`, `player`, `score`, `rank`). `useData(year)` reshapes the flat
  array into lookups by game id, by game name, and by player, plus the max single
  score used to normalize the score bars.
- `GET /api/games` returns every game's metadata (player-count bounds, cover image
  URL and extension) in the shape of `src/assets/games.json`, which stays in the repo
  as import source data and for `pnpm update`. Cover images in `src/assets/games/` are
  imported via Vite's `import.meta.glob`.
- `src/lib/games.ts` holds the pure logic — `buildSelectedGames` aggregates and
  sorts the games list, and `computeMaxScores` derives the normalization maxima.
  It takes injected dependencies (images, metadata, play counts) so it can be
  unit-tested without a rendered tree.

### Layout

```
src/
  App.tsx            Routes, theme, and top-level state wiring
  main.tsx           React entry point
  components/        UI components (table, rows, filters, detail views, ...)
  hooks/             useData, useLocalState, usePlayedCounts
  lib/games.ts       Pure games-list aggregation and score math
  assets/            games.json, cover images, styles, logo
  test/              Vitest setup and shared render helpers
server/              Hono API server, Better Auth, Drizzle schema (see Backend)
```

### Refreshing game metadata (`pnpm update`)

`update.cjs` keeps `games.json` and the local cover images in sync with the
score feed:

1. Fetches the current year's data feed and collects every `bgg_id` referenced.
2. For ids not already in `games.json`, queries the
   [BoardGameGeek XML API](https://boardgamegeek.com/wiki/page/BGG_XML_API2) in
   batches of 20 (throttled with a 5s pause between batches) for player counts
   and cover image URLs.
3. Writes the merged metadata back to `games.json`.
4. Downloads any missing cover images into `src/assets/games/`. Images marked
   `"custom"` are skipped so hand-picked art isn't overwritten.

It reads a `BGG_API_KEY` from the environment for the authenticated feed/API
requests. Commit the regenerated `games.json` and new images.

## Backend

The SPA is static and stays on Netlify at `games.lememcon.com`. The backend is a
separate Hono server in `server/`, built from the `Dockerfile` and meant to run as
an API-only service at `api.lememcon.com`. Login is Discord OAuth via Better Auth;
sessions live in PostgreSQL (Drizzle ORM). Roles are `anonymous`, `user` and `admin`
(a user whose Discord id is in `ADMIN_DISCORD_IDS`). Routes so far: `GET /healthz`,
`GET /api/me`, `GET /api/admin/ping`, and Better Auth under `/api/auth/*`. Game data:
public `GET /api/years`, `GET /api/years/:year/scores` and `GET /api/games`, and the
admin-only `POST /api/admin/import` (see Importing game data).

The browser only talks to `games.lememcon.com`: `public/_redirects` has a Netlify
rewrite of `/api/*` to `https://api.lememcon.com/api/:splat` (before the SPA fallback), so
the SPA, the CSRF check and the session cookie are all same-origin and no CORS is needed.
Consequences:

- `BETTER_AUTH_URL` is `https://games.lememcon.com` (not the API host), and the Discord
  redirect URI is `https://games.lememcon.com/api/auth/callback/discord`.
- Netlify's proxy has its own request limits and timeout. The import endpoint accepts at
  most about 5 MB (`413` beyond that), but a proxy in front may cut a large upload off
  earlier; a typical year is about 100 KB. Check an import of a real file after deploying.
- The server still supports direct cross-origin calls (`WEB_ORIGIN` for CORS and the CSRF
  origin check), but do not mix the two topologies.

Environment variables (see `.env.example`; a local `.env` is loaded automatically).
With the Netlify rewrite the Discord redirect URI is `https://games.lememcon.com/api/auth/callback/discord`.

| Variable                | Purpose                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                                                          |
| `BETTER_AUTH_SECRET`    | 32+ chars, `openssl rand -base64 32`                                                  |
| `BETTER_AUTH_URL`       | Public origin users see: `https://games.lememcon.com`; `http://localhost:3000` in dev |
| `DISCORD_CLIENT_ID`     | Discord application client id                                                         |
| `DISCORD_CLIENT_SECRET` | Discord application client secret                                                     |
| `ADMIN_DISCORD_IDS`     | Comma-separated Discord user ids that get the admin role                              |
| `PORT`                  | Listen port (default `8080`)                                                          |
| `WEB_ORIGIN`            | SPA origin for CORS/CSRF when calling the API cross-origin                            |

```sh
pnpm server:dev                          # watch mode
pnpm server:build && pnpm db:migrate     # compile, then apply migrations (also runs automatically at container start)
pnpm server:start                        # run the compiled server
pnpm db:generate                         # new migration after editing server/db/schema.ts
docker build -t lememcon-games .
docker run --env-file .env lememcon-games node dist-server/migrate.js   # optional: migrations already run at container start
docker run --env-file .env -p 8080:8080 lememcon-games
```

Locally, Vite (`pnpm dev`, :3000) proxies `/api` to `http://localhost:8080` (override with
`API_PROXY_TARGET`), so the browser stays on one origin. For Discord login in dev set
`BETTER_AUTH_URL=http://localhost:3000` and add
`http://localhost:3000/api/auth/callback/discord` as a Discord redirect URI. The app needs
the server (`pnpm server:dev`), PostgreSQL with migrations applied, and an imported year.

### Importing game data

The database starts empty and the app reads only from it. Admins load data on the
`/admin/import` page (or `POST /api/admin/import` with a JSON body, same-origin, admin
session; optional `?filename=` is stored with the year). Two shapes:

- **Year upload**: `{ "year": 2026, "player_game_scores": [{bgg_id, game, player, score, rank}], "games"?: {...} }`.
  Creates the year and its scores; an existing year is refused with `409` (there is no
  replace). Extra feed fields are dropped.
- **Games-only upload**: `{ "games": {...} }` or a bare `games.json`. Creates no year; it only
  adds or updates game metadata (player counts, image URL and extension). Metadata lives in
  `game_metadata` (shared with the BoardGameGeek download); an upload never replaces a stored
  value with a missing one, and a stored `"custom"` image is kept. The `game` table holds only
  the name, which stays empty until a score row names the game.

`sample-data.json` has no year, so add `"year": 2025` (or the right year) to it before
uploading it as a year upload. `src/assets/games.json` uploads as is (its `"custom"` image
marker is stored as is and the bundled cover is used). Rules: 20,000 score rows at
most, strings up to 200 characters, https image URLs only, extensions `.jpg .jpeg .png .webp
.gif`, no two game ids sharing a name, and players that differ only by case are one player
(first spelling wins; a warning says so). A game's stored name is never overwritten; a
changed name comes back as a warning. Responses: `201` with counts and warnings, `400`
bad JSON, `401`/`403` not an admin, `409` year exists, `413` over about 5 MB, `422`
`{ errors: [{ path, message }] }`.

There is no delete endpoint. To remove a year (its scores go with it), run:

```sql
DELETE FROM year WHERE year = 2026;
```

**Deploy order**: the app no longer carries its data, so deploy the backend and run the
migration (applied automatically when the container starts), then import `games.json` (games-only) and each
year through the admin page, and only then deploy the SPA (merge after the import).
Deploying the SPA first shows an empty app.

### BoardGameGeek data (admin)

Admins manage game metadata from the admin page (`/api/admin/bgg/*`): save a BGG API
key, test it, see which games the scores need versus what the database holds
(`game_metadata`), and download or redownload them. The key is encrypted with
AES-256-GCM using a key derived from `BETTER_AUTH_SECRET` and stored in `app_setting`;
rotating that secret means entering the key again. Download progress lives in memory,
so this assumes a single server instance. `pnpm update` stays until the app reads
metadata from the database.

### Player links (admin)

Admins link each score-sheet player to an app member in the "Player links" section of
the admin page (`GET /api/admin/player-links`, `PATCH /api/admin/players/:id` with
`{ "discordId": "<id>" }` to link or `{ "discordId": null }` to unlink). Pending members
can be linked too. Several players may point at one member. A link is stored on the
player row and persists across score uploads: an upload never changes it, a name that
differs only by case is the same player, and new names arrive unlinked. Removing a
member clears their links but keeps the player and its scores.

### Deploying the backend

Host-agnostic: build the `Dockerfile` and run the image on any container host behind
TLS. Migrations run automatically at container start (`node dist-server/migrate.js`, then
the server); a failed migration fails the start. A Postgres advisory lock makes concurrent
starts safe. `DATABASE_URL` must be in the Dokploy runtime env, and no Dokploy command
override may be set (it would skip the migration step). Migrations must stay backward
compatible with the still-running old release. Running the migration manually is optional.
Point the `api` DNS record at the host and use `GET /healthz` as the health check.

## Testing & quality

Every source file has a colocated `*.test.{ts,tsx}` suite. Vitest runs two
projects: `web` (jsdom, `src/`) and `server` (node, `server/`). Coverage is
enforced at 90% for statements, branches, functions, and lines across both (see
`vite.config.ts`, which also lists the few excluded files such as the server
entry points and DB wiring). Run one project with
`pnpm vitest run --project web` or `--project server`.

Server tests inject their dependencies (a fake session resolver, an in-memory user
store), and a third `server-db` project runs the real
migrations and SQL on an in-process PGlite database, so none need an external
PostgreSQL or the network. Running the app locally (`pnpm dev` proxies `/api` to
`pnpm server:dev`) needs the server, PostgreSQL and Discord keys. There are no
end-to-end tests yet.

[Lefthook](https://github.com/evilmartians/lefthook) runs pre-commit hooks —
Prettier, ESLint, typecheck, and the related Vitest tests — plus commit-message linting.
Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(enforced by commitlint).

## CI & deployment

- **CI** (`.github/workflows/ci.yml`) runs lint, format check, typecheck,
  tests with coverage, and a build on every push to `main` and every pull request. Pull
  requests also get their commit messages linted.
- **Deployment** of the SPA is handled by Netlify, which builds and publishes the
  `main` branch to [games.lememcon.com](https://games.lememcon.com). The backend image
  is deployed separately (see Deploying the backend).

## License

[MIT](https://github.com/lememcon/games?tab=MIT-1-ov-file#readme)
