import { expect, test, type Page } from "@playwright/test";

import type { GamesData, PlayerGameScore, Profile } from "../../src/types";
import {
  aliceId,
  approvedUser,
  games,
  mockApi,
  scores,
  years,
} from "./fixtures";

test.use({ viewport: { width: 375, height: 812 } });

const longName = "Bartholomew Maximilian Featherstonehaugh-Wetherington";
const longTitle =
  "Twilight Imperium Fourth Edition Prophecy of Kings Expansion Deluxe";
const unbreakable = "G".repeat(60);

const profileFor = (name: string): Profile => ({
  discordId: aliceId,
  name,
  image: null,
  linkedPlayers: ["Alice"],
  gamesPlayed: 12,
  stats: {
    years: 2,
    topByYear: years.map((year) => ({
      year,
      total: 9,
      games: [
        { bggId: 101, game: longTitle, rank: 1, score: 10 },
        { bggId: 102, game: "Beta", rank: 2, score: 7 },
      ],
    })),
  },
});

const namedGames: GamesData = {
  ...games,
  "101": { ...games["101"], name: longTitle },
  "102": { ...games["102"], name: "Beta" },
};

// Only the own-profile test uses this game: its name has no break points.
const gamesWithUnbreakable: GamesData = {
  ...namedGames,
  "103": { ...games["103"], name: unbreakable },
};

const longScores: PlayerGameScore[] = scores.map((s) =>
  s.bgg_id === 101 ? { ...s, game: longTitle } : s,
);

const unbreakableScores: PlayerGameScore[] = longScores.map((s) =>
  s.bgg_id === 103 ? { ...s, game: unbreakable } : s,
);

const setup = (page: Page, name = longName, unbreakableGame = false) =>
  mockApi(page, {
    me: {
      status: "approved",
      user: { ...approvedUser, displayName: name },
    },
    games: unbreakableGame ? gamesWithUnbreakable : namedGames,
    scores: unbreakableGame ? unbreakableScores : longScores,
    profile: profileFor(name),
    overrides: [
      { discordId: aliceId, bggId: 101, min: 2, max: 3 },
      { discordId: aliceId, bggId: 103, min: 2, max: 3 },
    ],
    vetoes: [
      { bggId: 101, name: longTitle },
      { bggId: 103, name: unbreakable },
    ],
    played: ["101", "102", "103"],
    playedByYear: {
      "2024": { [aliceId]: ["101", "102"] },
      "2023": { [aliceId]: ["102"] },
    },
  });

const expectNoOverflow = async (page: Page) => {
  const [scrollWidth, clientWidth] = await page.evaluate<[number, number]>(
    "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
  );
  expect(scrollWidth, `scrollWidth ${scrollWidth}`).toBeLessThanOrEqual(
    clientWidth,
  );
};

test("own profile does not overflow horizontally", async ({ page }) => {
  await setup(page, longName, true);
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await expect(page.getByText("Your player counts")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Game to veto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Game to add" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: `Minimum players for ${longTitle}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Undo veto of ${longTitle}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Undo veto of ${unbreakable}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: `Minimum players for ${unbreakable}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Remove ${unbreakable}` }),
  ).toBeVisible();
  await expectNoOverflow(page);
});

test("public profile does not overflow horizontally", async ({ page }) => {
  await setup(page);
  await page.goto(`/players/${aliceId}`);
  await expect(page.getByRole("heading", { name: longName })).toBeVisible();
  await expect(page.getByText("2024 in review")).toBeVisible();
  await expectNoOverflow(page);
});

test("public profile wraps an unbreakable name", async ({ page }) => {
  const name = "A".repeat(60);
  await setup(page, name);
  await page.goto(`/players/${aliceId}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expectNoOverflow(page);
});

test("year recap wraps an unbreakable name", async ({ page }) => {
  const name = "A".repeat(60);
  await setup(page, name);
  await page.goto(`/players/${aliceId}/recap/2024`);
  await expect(page.getByText(`Only ${name} played`)).toBeVisible();
  await expectNoOverflow(page);
});

test("year recap does not overflow horizontally", async ({ page }) => {
  await setup(page);
  await page.goto(`/players/${aliceId}/recap/2024`);
  await expect(
    page.getByRole("heading", { name: /2024 in review/ }),
  ).toBeVisible();
  await expect(page.getByText("first played 2024")).toBeVisible();
  await expectNoOverflow(page);
});
