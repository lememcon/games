import { expect, test } from "@playwright/test";

import {
  aliceId,
  bobId,
  gameOrder,
  games,
  longNamedMembers,
  mockApi,
  scores,
} from "./fixtures";

test("scoreboard ranks the newest year's games", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  await expect(page.getByRole("combobox")).toHaveValue("2024");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  const names = page.getByRole("link", {
    name: new RegExp(`^(${gameOrder.join("|")})$`),
  });
  await expect(names).toHaveText(gameOrder);
});

test("player filter narrows the list and game detail shows scores", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  await page.getByRole("button", { name: "Cara" }).click();
  await expect(page.getByText("2 of 4 games")).toBeVisible();
  await expect(page.getByRole("link", { name: "Gamma" })).toHaveCount(0);

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  await page.getByRole("link", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Raw Score" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Cara" })).toBeVisible();

  await page.getByRole("link", { name: "Back to games" }).first().click();
  await expect(page.getByText("4 of 4 games")).toBeVisible();
});

test("marking played picks the players and saves them to the server", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  const puts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "PUT") puts.push(new URL(req.url()).pathname);
  });
  const post = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/played/2024/101",
  );
  const toggle = page.getByRole("button", { name: "Played: Alpha" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cara · no account" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Bob" }).click();
  await dialog.getByRole("button", { name: "Mark 2 played" }).click();

  expect((await post).postDataJSON()).toEqual({ discordIds: [aliceId, bobId] });
  await expect(dialog).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(puts).toEqual([]);
});

test("a game that does not fit the group size is filtered out", async ({
  page,
}) => {
  await mockApi(page, {
    games: { ...games, "104": { players: { min: 4, max: 4 }, image: null } },
  });
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  await page.getByRole("button", { name: "Alice" }).click();
  await page.getByRole("button", { name: "Bob" }).click();
  await expect(page.getByText("3 of 4 games")).toBeVisible();
  await expect(page.getByRole("link", { name: "Delta" })).toHaveCount(0);
});

test("podium card feet stay aligned when played-by wraps", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { members, rows } = longNamedMembers(6);
  await mockApi(page, {
    scores: [
      ...rows,
      ...scores.filter((s) => s.bgg_id === 102 || s.bgg_id === 103),
    ],
    playedByYear: {
      "2024": Object.fromEntries([
        ...members.map((m) => [m.discordId, ["101"]]),
        [aliceId, ["102"]],
      ]),
    },
  });
  await page.goto("/");
  await expect(page.locator(".tray-card")).toHaveCount(3);

  const bottoms = await page
    .locator(".tray-card__foot")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(bottoms).toHaveLength(3);
  for (const bottom of bottoms) {
    expect(Math.abs(bottom - bottoms[0])).toBeLessThanOrEqual(1);
  }
});
