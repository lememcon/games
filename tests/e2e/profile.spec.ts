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

const profile: Profile = {
  discordId: aliceId,
  name: longName,
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
};

const namedGames: GamesData = {
  ...games,
  "101": { ...games["101"], name: longTitle },
  "102": { ...games["102"], name: "Beta" },
};

const longScores: PlayerGameScore[] = scores.map((s) =>
  s.bgg_id === 101 ? { ...s, game: longTitle } : s,
);

const setup = (page: Page) =>
  mockApi(page, {
    me: {
      status: "approved",
      user: { ...approvedUser, displayName: longName },
    },
    games: namedGames,
    scores: longScores,
    profile,
    overrides: [{ discordId: aliceId, bggId: 101, min: 2, max: 3 }],
    vetoes: [{ bggId: 101, name: longTitle }],
    played: ["101", "102"],
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
  await setup(page);
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
  await expectNoOverflow(page);
});

test("public profile does not overflow horizontally", async ({ page }) => {
  await setup(page);
  await page.goto(`/players/${aliceId}`);
  await expect(page.getByRole("heading", { name: longName })).toBeVisible();
  await expect(page.getByText("2024 in review")).toBeVisible();
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
