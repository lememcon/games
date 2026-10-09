# CLAUDE.md

Project guidance for Claude Code. See `README.md` for the human-facing overview.

## What this is

Single-page app that ranks and filters LememCon board-game scores. Built with React 19,
Vite, and Mantine 8, routed with wouter, data munged with ramda. Written in TypeScript.
Netlify serves the static SPA at games.lememcon.com (auto-builds `main`). The backend
(`server/`, Hono + Better Auth + Drizzle/PostgreSQL) is deployed separately from the
`Dockerfile` to the API subdomain, api.lememcon.com.

## Commands

- `pnpm dev` — dev server on http://localhost:3000 (auto-opens)
- `pnpm test` — Vitest watch; `pnpm test:run` for a single pass (both projects)
- `pnpm test:coverage` — coverage with the 90% gate enforced
- `pnpm server:dev` / `server:build` / `server:start` — run, bundle (tsup to `dist-server/`),
  and start the server; `pnpm db:generate` / `db:migrate` for Drizzle migrations
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
- `src/hooks/` — `useData` (fetches live score JSON), `useLocalState` (localStorage-backed
  state), `usePlayedCounts`.
- `src/components/` — presentational + container components (`.tsx`).
- `src/assets/` — `games.json`, cover images (refreshed by `pnpm update`), styles.
- `src/test/setup.ts` — Vitest setup; jsdom shims for Mantine (see below).
- `server/` — Node server. `app.ts` (`createApp`, routes), `auth.ts` (Better Auth, session
  resolver), `middleware.ts` (csrf, session, admin guard), `static.ts` (SPA + cache headers; no longer needed by the API host),
  `env.ts` (env parsing), `types.ts`, `db/` (Drizzle client + schema), `index.ts` (boot),
  `migrate.ts` (separate migration command).
- `@` is an alias for `src/` (configured in `vite.config.ts`).

## Conventions

- **TypeScript everywhere.** Prefer typing against `src/types.ts` over inline shapes; add
  to that file when a shape is shared. `pnpm typecheck` must pass — it's a CI gate and
  part of `pnpm check`.
- **Colocated tests.** Every source file has a sibling `Name.test.tsx`/`Name.test.ts`.
  Adding or changing behavior means updating the sibling test — the 90% coverage gate
  (`vite.config.ts`) blocks CI otherwise.
- **SPA and API are cross-origin siblings (current assumption: direct cross-origin
  calls; a Netlify `/api/*` rewrite is a documented alternative in README Backend, topology
  decision pending).** Do not assume same-origin cookies, CSRF or
  static serving. This includes local dev (Vite :3000 vs API :8080, same-site); the
  planned local option is a Vite `server.proxy` for `/api`. The CSRF/CORS/`WEB_ORIGIN`
  changes needed for this are not done yet (see README Backend).
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
  signal handling, needs a real Postgres), `server/migrate.ts` (standalone CLI),
  `server/db/**` (Drizzle client and schema, thin wiring), `server/types.ts` (types only),
  and the test files themselves.
- **Server test patterns**: dependencies are injected, never real. `createApp` takes a fake
  `resolveSession` and `authHandler`; `createSessionResolver` takes a fake `auth` and a fake
  `Db` that stubs the one select chain; `app.test.ts` serves a per-suite temp directory, while
  `static.test.ts` mounts `process.cwd()` to cover the `staticDir === cwd` (root `"."`)
  branch; `createAuth` is given `{} as Db` and only exercises paths that never query. No test
  needs Postgres or the network.
- **No integration or e2e tests yet.** Unit tests with injected deps cover the logic;
  a real-Postgres or browser suite is deliberately deferred.

### Gotchas

`src/test/setup.ts` mocks `window.matchMedia`, `ResizeObserver`, and
`Element.prototype.scrollIntoView` because jsdom lacks them and Mantine's color-scheme,
popover (MultiSelect), and Combobox components need them. If a new Mantine component fails
in tests with a missing-browser-API error, add the shim there.

## Node

Use Node 22 (see `.nvmrc`); CI runs `lts/*`. Package manager is pnpm (pinned in
`package.json`); install with `pnpm install`.
