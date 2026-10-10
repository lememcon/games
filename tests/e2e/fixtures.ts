import type { Page, Route } from "@playwright/test";

import type {
  ApprovedUser,
  GamesData,
  Me,
  PlayerGameScore,
} from "../../src/types";

export const approvedUser: ApprovedUser = {
  discordId: "1001",
  name: "Alice",
  image: null,
  displayName: null,
  discordName: "Alice",
  role: "member",
};

export const approvedMe: Me = { status: "approved", user: approvedUser };
export const anonymousMe: Me = { status: "anonymous" };
export const pendingMe: Me = {
  status: "pending",
  user: { discordId: "2002", name: "Newcomer", image: null },
};

export const years = [2023, 2024];

// Alpha 27, Beta 21, Gamma 13, Delta 7: distinct totals fix the rank order.
// Cara only played Alpha and Beta.
const row = (
  bgg_id: number,
  game: string,
  player: string,
  score: number,
  rank: number,
): PlayerGameScore => ({ bgg_id, game, player, score, rank });

export const scores: PlayerGameScore[] = [
  row(101, "Alpha", "Alice", 10, 1),
  row(101, "Alpha", "Bob", 9, 2),
  row(101, "Alpha", "Cara", 8, 3),
  row(102, "Beta", "Alice", 7, 2),
  row(102, "Beta", "Bob", 8, 1),
  row(102, "Beta", "Cara", 6, 3),
  row(103, "Gamma", "Alice", 6, 2),
  row(103, "Gamma", "Bob", 7, 1),
  row(104, "Delta", "Alice", 4, 1),
  row(104, "Delta", "Bob", 3, 2),
];

export const gameOrder = ["Alpha", "Beta", "Gamma", "Delta"];

export const games: GamesData = {
  "101": { players: { min: 1, max: 4 }, image: null },
  "102": { players: { min: 1, max: 4 }, image: null },
  "103": { players: { min: 2, max: 4 }, image: null },
  "104": { players: { min: 2, max: 4 }, image: null },
};

interface MockOptions {
  me?: Me;
  games?: GamesData;
  played?: Record<string, number>;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, json: body });

const pathOf = (url: URL | string) => new URL(url).pathname;

// Mocks the whole API. Playwright tries the most recently registered route
// first, so the catch-all goes in first and the specific routes override it.
export async function mockApi(page: Page, opts: MockOptions = {}) {
  const { me = approvedMe, played = {}, games: gamesData = games } = opts;

  await page.route(
    (url) => pathOf(url).startsWith("/api/"),
    (route) => json(route, { error: "Not mocked" }, 404),
  );
  await page.route(
    (url) => pathOf(url) === "/api/me",
    (route) => json(route, me),
  );
  await page.route(
    (url) => pathOf(url) === "/api/years",
    (route) => json(route, { years }),
  );
  await page.route(
    (url) => pathOf(url) === "/api/years/totals",
    (route) => json(route, { totals: [] }),
  );
  await page.route(
    (url) => pathOf(url) === "/api/games",
    (route) => json(route, gamesData),
  );
  await page.route(
    (url) => /^\/api\/years\/\d+\/scores$/.test(pathOf(url)),
    (route) => json(route, { player_game_scores: scores }),
  );
  await page.route(
    (url) => pathOf(url) === "/api/player-overrides",
    (route) => json(route, { overrides: [] }),
  );
  await page.route(
    (url) => pathOf(url) === "/api/vetoes",
    (route) => json(route, { vetoes: [] }),
  );
  await page.route(
    (url) => pathOf(url) === "/api/me/vetoes",
    (route) => json(route, { vetoes: [] }),
  );
  await page.route(
    (url) => /^\/api\/me\/vetoes\/\d+\/\d+$/.test(pathOf(url)),
    (route) => route.fulfill({ status: 204 }),
  );
  await page.route(
    (url) => pathOf(url) === "/api/me/played",
    (route) => json(route, { counts: played }),
  );
  await page.route(
    (url) => /^\/api\/me\/played\/\d+\/\d+$/.test(pathOf(url)),
    (route) => json(route, {}),
  );
}
