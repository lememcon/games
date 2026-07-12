# LememCon Games

[![site](https://img.shields.io/netlify/261ad471-fd16-4d17-89b1-43dcc8fd7af4?logo=netlify&logoColor=%23fff&label=site)](https://games.lememcon.com)
[![license](https://img.shields.io/github/license/lememcon/games?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNNyAyMGwxMCAwIi8%2BPHBhdGggZD0iTTYgNmw2IC0xbDYgMSIvPjxwYXRoIGQ9Ik0xMiAzbDAgMTciLz48cGF0aCBkPSJNOSAxMmwtMyAtNmwtMyA2YTMgMyAwIDAgMCA2IDAiLz48cGF0aCBkPSJNMjEgMTJsLTMgLTZsLTMgNmEzIDMgMCAwIDAgNiAwIi8%2BPC9zdmc%2B&logoColor=%23fff&color=%23750014)](https://github.com/lememcon/games?tab=MIT-1-ov-file#readme)

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

- **[React 19](https://react.dev/)** + **[Vite 6](https://vite.dev/)** (SWC plugin)
- **[Mantine 8](https://mantine.dev/)** for UI components and theming
- **[wouter](https://github.com/molefrog/wouter)** for routing
- **[ramda](https://ramdajs.com/)** for data transforms
- **[lucide-react](https://lucide.dev/)** for icons
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
| `pnpm fix`           | Auto-fix formatting then lint                       |
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
- `src/lib/games.js` holds the pure logic — `buildSelectedGames` aggregates and
  sorts the games list, and `computeMaxScores` derives the normalization maxima.
  It takes injected dependencies (images, metadata, play counts) so it can be
  unit-tested without a rendered tree.

### Layout

```
src/
  App.jsx            Routes, theme, and top-level state wiring
  main.jsx           React entry point
  components/        UI components (table, rows, filters, detail views, ...)
  hooks/             useData, useLocalState, usePlayedCounts
  lib/games.js       Pure games-list aggregation and score math
  assets/            games.json, cover images, styles, logo
  test/              Vitest setup and shared render helpers
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

## Testing & quality

Every source file has a colocated `*.test.{js,jsx}` suite. Coverage is enforced
at 90% for statements, branches, functions, and lines (see `vite.config.js`).

[Lefthook](https://github.com/evilmartians/lefthook) runs pre-commit hooks —
Prettier, ESLint, and the related Vitest tests — plus commit-message linting.
Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(enforced by commitlint).

## CI & deployment

- **CI** (`.github/workflows/ci.yml`) runs lint, format check, tests with
  coverage, and a build on every push to `main` and every pull request. Pull
  requests also get their commit messages linted.
- **Deployment** is handled by Netlify, which builds and publishes the `main`
  branch to [games.lememcon.com](https://games.lememcon.com).

## License

[MIT](https://github.com/lememcon/games?tab=MIT-1-ov-file#readme)
