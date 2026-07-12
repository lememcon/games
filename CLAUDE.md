# CLAUDE.md

Project guidance for Claude Code. See `README.md` for the human-facing overview.

## What this is

Single-page app that ranks and filters LememCon board-game scores. Built with React 19,
Vite, and Mantine 8, routed with wouter, data munged with ramda. Written in TypeScript.
Deployed to games.lememcon.com via Netlify (auto-builds `main`).

## Commands

- `pnpm dev` — dev server on http://localhost:3000 (auto-opens)
- `pnpm test` — Vitest watch; `pnpm test:run` for a single pass
- `pnpm test:coverage` — coverage with the 90% gate enforced
- `pnpm typecheck` — `tsc --noEmit` across the app and node configs
- `pnpm fix` — Prettier then ESLint `--fix` (run this instead of hand-formatting)
- `pnpm check` — full local gate: lint → pretty → typecheck → test → build

Run `pnpm check` before considering a change done. CI (`.github/workflows/ci.yml`) runs
lint → pretty → typecheck → test:coverage → build — the same gate as `pnpm check`.

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
- `@` is an alias for `src/` (configured in `vite.config.ts`).

## Conventions

- **TypeScript everywhere.** Prefer typing against `src/types.ts` over inline shapes; add
  to that file when a shape is shared. `pnpm typecheck` must pass — it's a CI gate and
  part of `pnpm check`.
- **Colocated tests.** Every source file has a sibling `Name.test.tsx`/`Name.test.ts`.
  Adding or changing behavior means updating the sibling test — the 90% coverage gate
  (`vite.config.ts`) blocks CI otherwise.
- **Keep logic out of components.** Non-trivial computation belongs in `src/lib/games.ts`
  so it can be tested without rendering. Follow the existing pure-function pattern.
- **Imports are auto-sorted** by `@ianvs/prettier-plugin-sort-imports` (order defined in
  `package.json`). Don't hand-order imports; `pnpm fix` handles it.
- **Conventional Commits**, enforced by commitlint on PRs (length limits disabled).
- Lefthook runs Prettier → ESLint → Vitest on pre-commit, and commitlint on commit-msg.

## Testing gotchas

`src/test/setup.ts` mocks `window.matchMedia`, `ResizeObserver`, and
`Element.prototype.scrollIntoView` because jsdom lacks them and Mantine's color-scheme,
popover (MultiSelect), and Combobox components need them. If a new Mantine component fails
in tests with a missing-browser-API error, add the shim there.

## Node

Use Node 22 (see `.nvmrc`); CI runs `lts/*`. Package manager is pnpm (pinned in
`package.json`); install with `pnpm install`.
