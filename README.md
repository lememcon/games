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
- **Year switcher** — pick any year from 2025 to the current year; each year is
  a separate data feed.
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

Score data is **not** bundled — it's fetched at runtime:

- `useData(year)` fetches `https://data.lememcon.com/{year}.json` and reshapes
  the flat `player_game_scores` array into lookups by game id, by game name, and
  by player, plus the max single score used to normalize the score bars.
- `src/assets/games.json` is the one bundled data file. It maps a BoardGameGeek
  id to static metadata — player-count bounds and the cover image extension.
  Cover images live in `src/assets/games/<bgg_id>.<ext>` and are imported via
  Vite's `import.meta.glob`.
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
`GET /api/me`, `GET /api/admin/ping`, and Better Auth under `/api/auth/*`.

The SPA and the API are different origins (same site). Not done yet: the CSRF check in
`server/middleware.ts` accepts `Sec-Fetch-Site` `same-origin`/`none` or, when that header
is absent, an `Origin` equal to `BETTER_AUTH_URL`. Browsers always send `Sec-Fetch-Site`,
so a browser POST from `games.lememcon.com` to `api.lememcon.com`
(`Sec-Fetch-Site: same-site`) gets a 403. There is also no CORS yet (it needs `cors()`
with the web origin, credentials and preflight on `/api/*`), `trustedOrigins` in
`server/auth.ts` lacks the web origin, the SPA makes no `/api` calls yet (future ones
need an API base URL and `credentials: "include"`), and the server and image still
serve and bundle the SPA (`server/static.ts`, `pnpm build` and the `dist/` copy in the
`Dockerfile`), which the API host does not need. A host-only session cookie on
`api.lememcon.com` with `credentials: "include"` should work because the hosts are
same-site; a `.lememcon.com` cookie domain is only needed if that proves insufficient.

An alternative is a Netlify rewrite of `/api/*` to the API host, so the browser sees
one origin and the CSRF, CORS and cookie work is avoided. With that rewrite
`BETTER_AUTH_URL` and the Discord redirect URI stay `https://games.lememcon.com`, so do
not mix the two topologies.

Environment variables (see `.env.example`; a local `.env` is loaded automatically).
The Discord redirect URI is `https://api.lememcon.com/api/auth/callback/discord`.

| Variable                | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                             |
| `BETTER_AUTH_SECRET`    | 32+ chars, `openssl rand -base64 32`                     |
| `BETTER_AUTH_URL`       | API origin, e.g. `https://api.lememcon.com`              |
| `DISCORD_CLIENT_ID`     | Discord application client id                            |
| `DISCORD_CLIENT_SECRET` | Discord application client secret                        |
| `ADMIN_DISCORD_IDS`     | Comma-separated Discord user ids that get the admin role |
| `PORT`                  | Listen port (default `8080`)                             |
| `WEB_ORIGIN`            | Planned, not implemented yet: SPA origin for CORS/CSRF   |

```sh
pnpm server:dev                          # watch mode
pnpm server:build && pnpm db:migrate     # compile, then apply migrations (separate from boot)
pnpm server:start                        # run the compiled server
pnpm db:generate                         # new migration after editing server/db/schema.ts
docker build -t lememcon-games .
docker run --env-file .env lememcon-games node dist-server/migrate.js   # apply migrations before first start
docker run --env-file .env -p 8080:8080 lememcon-games
```

Locally the SPA (Vite on :3000) and the API (:8080) are also different origins on the
same site, so the same CSRF 403 applies to POSTs. The planned local option is a Vite
`server.proxy` for `/api` to `http://localhost:8080`, which makes local calls
same-origin (not configured yet).

### Deploying the backend

Host-agnostic: build the `Dockerfile` and run the image on any container host behind
TLS. Run `node dist-server/migrate.js` (with the production env) before starting any
release that adds migrations; migrations are separate from boot. Point the `api` DNS
record at the host and use `GET /healthz` as the health check.

## Testing & quality

Every source file has a colocated `*.test.{ts,tsx}` suite. Vitest runs two
projects: `web` (jsdom, `src/`) and `server` (node, `server/`). Coverage is
enforced at 90% for statements, branches, functions, and lines across both (see
`vite.config.ts`, which also lists the few excluded files such as the server
entry points and DB wiring). Run one project with
`pnpm vitest run --project web` or `--project server`.

Server tests inject their dependencies (a fake session resolver, an in-memory user
store, a temporary static directory), and a third `server-db` project runs the real
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
