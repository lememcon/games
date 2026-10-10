# CLAUDE.md

Project guidance for Claude Code. See `README.md` for the human-facing overview.

## What this is

Single-page app that ranks and filters LememCon board-game scores. Built with React 19,
Vite, and Mantine 9, routed with wouter, data munged with ramda. Written in TypeScript.
Netlify serves the static SPA at games.lememcon.com (auto-builds `main`). The backend
(`server/`, Hono + Better Auth + Drizzle/PostgreSQL) is deployed separately from the
`Dockerfile` to the API subdomain, api.lememcon.com.

## Commands

- `pnpm dev` — dev server on http://localhost:3000 (auto-opens)
- `pnpm test` — Vitest watch; `pnpm test:run` for a single pass (both projects)
- `pnpm test:coverage` — coverage with the 90% gate enforced
- `pnpm server:dev` / `server:build` / `server:start` — run, bundle (tsup to `dist-server/`),
  and start the server; `pnpm db:generate` / `db:migrate` for Drizzle migrations
- `pnpm test:e2e` — Playwright smoke tests (`tests/e2e/`, API mocked, own Vite on :3100);
  run `pnpm exec playwright install chromium` once first. Separate CI job `e2e`, not part
  of `pnpm check`
- `pnpm typecheck` — `tsc --noEmit` across the app and node configs
- `pnpm fix` — Prettier then ESLint `--fix` (run this instead of hand-formatting)
- `pnpm check` — local gate: lint → pretty → typecheck → test:run → build → server:build
  (no coverage gate)

Run `pnpm check` before considering a change done. CI (`.github/workflows/ci.yml`) runs
lint → pretty → typecheck → test:coverage → build in a `check` job (no `server:build`), so
also run `pnpm test:coverage` to catch coverage-gate failures that `pnpm check` misses.
A separate `commitlint` job runs on pull requests only.

## Layout

- `src/types.ts` — shared domain model (`PlayerGameScore`, `GameMeta`, etc.). Types are
  derived from how the remote data is actually consumed; start here to understand shapes.
- `src/lib/games.ts` — pure score/ranking logic (`gameBounds`, `computeMaxScores`,
  `buildSelectedGames`). No React, no I/O; this is where game math lives and is unit-tested
  directly.
- `src/lib/authError.ts` — pure helpers for the OAuth `?error=` redirect (`readAuthError`,
  `describeAuthError`, `stripAuthError`); allowlisted codes, fixed copy, never echoes input.
- `src/lib/profile.ts` — pure display-name validation and profile stat formatters;
  `src/lib/playerColors.ts` — the player color context (kept out of `PlayerName.tsx` for
  react-refresh).
- `src/hooks/` — `useData` (fetches live score JSON), `useLocalState` (localStorage-backed
  state), `usePlayedCounts` (server-backed per-member counts via `/api/me/played`, with a
  import of the legacy `played_counts_<year>` localStorage key the first time that
  year is viewed while signed in, see
  `lib/playedMigration.ts`), `useAuthError` (reads then strips `?error=` from the URL),
  `useProfile` (public profile), `useDisplayName` (PUT own display name).
- `src/components/` — presentational + container components (`.tsx`). `ProfilePage`
  (`/profile`) and `PublicProfile` (`/players/:discordId`) render in `AdminShell` outside
  `Scoreboard`; `PlayerName` links to a profile when a score row has `discord_id`.
- `src/assets/` — `games.json`, cover images (refreshed by `pnpm update`), styles.
- `src/test/setup.ts` — Vitest setup; jsdom shims for Mantine (see below).
- `server/` — Node server. `app.ts` (`createApp`, routes), `auth.ts` (Better Auth, session
  resolver), `middleware.ts` (csrf, session, admin guard),
  `env.ts` (env parsing), `types.ts`, `db/` (Drizzle client + schema), `index.ts` (boot),
  `migrate.ts` (runs before the server in the Docker `CMD`; also a standalone CLI).
  - Game data: `import.ts` (pure upload validation, `parseImport`, year and games-only
    shapes), `shape.ts` (pure shaping: legacy row shape, games map, chunking, rename
    detection, counts), `routes/data.ts` (public `GET /api/years`,
    `/api/years/:year/scores`, `/api/games`), `routes/import.ts`
    (`POST /api/admin/import`, admin only, 5 MB limit). SQL is thin and lives in
    `db/import.ts`, `db/read.ts` and `db/dataStore.ts` (the `DataStore` behind `deps.data`);
    `testing.ts` has `fakeData()` for route tests. Game metadata (players, image) lives only in
    `game_metadata` (`db/bggRepo.ts` `upsertMetadata`, shared with the import); the `game`
    table holds just `bgg_id` and a nullable name, and `/api/games` full-joins the two.
  - Played counts: `played.ts` (pure validation), `routes/played.ts` (`GET /api/me/played?year=`,
    `PUT /api/me/played/:year/:bggId`, `POST /api/me/played/:year/import`, plus the
    approved-only bulk read `GET /api/played?year=` behind `useAllPlayedCounts`),
    `db/playedStore.ts` (the `PlayedStore` behind `deps.played`; table `played_count`, one
    row per member, year and game); `testing.ts` has `fakePlayed()`.
- `@` is an alias for `src/` (configured in `vite.config.ts`).

## Conventions

- **TypeScript everywhere.** Prefer typing against `src/types.ts` over inline shapes; add
  to that file when a shape is shared. `pnpm typecheck` must pass — it's a CI gate and
  part of `pnpm check`.
- **Colocated tests.** Every source file has a sibling `Name.test.tsx`/`Name.test.ts`.
  Adding or changing behavior means updating the sibling test — the 90% coverage gate
  (`vite.config.ts`) blocks CI otherwise.
- **SPA and API are same-origin from the browser's view (default topology).** Netlify
  proxies `/api/*` to `https://api.lememcon.com/api/:splat` (`public/_redirects`), and Vite
  proxies `/api` to `:8080` in dev, so the SPA needs no CORS or cross-site cookie.
  `BETTER_AUTH_URL` and the Discord redirect therefore use the games.lememcon.com origin
  (`http://localhost:3000` locally). The server still supports direct cross-origin calls
  (`WEB_ORIGIN`, CORS, CSRF origin check); do not mix the two. The API does not serve the SPA. See README Backend.
- **Keep logic out of components.** Non-trivial computation belongs in `src/lib/games.ts`
  so it can be tested without rendering. Follow the existing pure-function pattern.
- **Imports are auto-sorted** by `@ianvs/prettier-plugin-sort-imports` (order defined in
  `package.json`). Don't hand-order imports; `pnpm fix` handles it.
- **Conventional Commits**, enforced by commitlint on PRs (length limits disabled).
- Lefthook runs Prettier → ESLint → typecheck → `vitest related` (coverage disabled) on
  pre-commit, and commitlint on commit-msg.

## Testing

- **Two Vitest projects** (`vite.config.ts`): `web` (jsdom, `src/**/*.test.{ts,tsx}`, setup
  `src/test/setup.ts`) and `server` (node, `server/**/*.test.ts`). Run one with
  `pnpm vitest run --project web` or `--project server`.
- **Colocated tests**, one sibling per source file.
- **Coverage** (v8) covers `src/**/*.{ts,tsx}` and `server/**/*.ts`; thresholds are 90% for
  statements, branches, functions and lines.
- **Excluded from coverage** (`vite.config.ts`): `src/main.tsx` (entry point), `src/vite-env.d.ts`
  and `src/types.ts` (types only), `src/test/**` (test helpers), `server/index.ts` (boot and
  signal handling, needs a real Postgres), `server/migrate.ts` (runs before the server in the Docker CMD; standalone CLI),
  `server/db/**` (Drizzle client and schema, thin wiring), `server/types.ts` (types only),
  and the test files themselves.
- **Server test patterns**: dependencies are injected, never real. `createApp` takes a fake
  `resolveSession` and `authHandler`; `createSessionResolver` takes a fake `auth` and a fake
  `Db` that stubs the one select chain; `createAuth` is given `{} as Db` and only exercises paths that never query. The
  `server-db` project (`server/db/**`) runs the real migrations and SQL on in-process
  PGlite. No test needs an external Postgres or the network; running the app locally
  (`pnpm dev` proxies `/api` to `pnpm server:dev`) needs the server, Postgres and Discord keys.
- **E2E smoke tests are mocked.** `tests/e2e/` (Playwright, Chromium) drives the real SPA
  against mocked `/api` routes (`fixtures.ts` `mockApi`); there is no real server or
  Postgres in them, and a real-Postgres suite is deliberately deferred. They sit outside
  Vitest and the coverage gate.

### Gotchas

`src/test/setup.ts` mocks `window.matchMedia`, `ResizeObserver`, and
`Element.prototype.scrollIntoView` because jsdom lacks them and Mantine's color-scheme,
popover (MultiSelect), and Combobox components need them. If a new Mantine component fails
in tests with a missing-browser-API error, add the shim there.

## Node

Use Node 22 (see `.nvmrc`); CI runs `lts/*`. Package manager is pnpm (pinned in
`package.json`); install with `pnpm install`.
