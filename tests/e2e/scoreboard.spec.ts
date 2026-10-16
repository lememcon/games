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
  // Played-by lists arrive from the async /api/played mock; wait for the long
  // one to render so the feet are measured after it has wrapped.
  await expect(
    page
      .locator(".tray-played-by__list")
      .filter({ hasText: "Featherstonehaugh 6" }),
  ).toBeVisible();

  const bottoms = await page
    .locator(".tray-card__foot")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(bottoms).toHaveLength(3);
  for (const bottom of bottoms) {
    expect(Math.abs(bottom - bottoms[0])).toBeLessThanOrEqual(1);
  }
});

test("compact row keeps the cover at the top on a phone when played-by is long", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { members, rows } = longNamedMembers(6);
  await mockApi(page, {
    scores: [...rows, ...scores.filter((s) => s.bgg_id !== 101)],
    playedByYear: {
      "2024": Object.fromEntries(members.map((m) => [m.discordId, ["104"]])),
    },
  });
  await page.goto("/");
  const row = page.locator(".tray-row").filter({ hasText: "Delta" });
  // Wait for the async /api/played mock so the row is measured after the list
  // has grown.
  await expect(
    row
      .locator(".tray-played-by__list")
      .filter({ hasText: "Featherstonehaugh 6" }),
  ).toBeVisible();

  const box = (selector: string) =>
    row
      .locator(selector)
      .first()
      .evaluate((el) => {
        const { top, bottom } = el.getBoundingClientRect();
        return { top, bottom };
      });
  const rowBox = await row.evaluate((el) => el.getBoundingClientRect().top);
  const cover = await box(".tray-cover");
  const head = await box(".tray-row__head");
  const actions = await box(".tray-row__actions");
  const playedBy = await box(".tray-played-by");

  expect(cover.top - rowBox).toBeLessThanOrEqual(40);
  expect(Math.abs(cover.top - head.top)).toBeLessThanOrEqual(40);
  expect(playedBy.top).toBeGreaterThanOrEqual(actions.bottom - 1);
});

test("phone rows keep 44px tap targets and fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  const buttons = page.locator(".tray-row__actions button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  const scores = page.locator(".tray-row__score");
  for (let i = 0; i < (await scores.count()); i++) {
    const box = await scores.nth(i).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  expect(
    await page.evaluate("document.documentElement.scrollWidth"),
  ).toBeLessThanOrEqual(375);
});

test("phone rows with a year veto fit the viewport and keep 44px targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page, { yearVetoes: [101, 102, 103, 104] });
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();
  await expect(page.getByRole("button", { name: "Veto: Delta" })).toHaveText(
    "✓ Skipped 2024",
  );

  const buttons = page.locator(".tray-row__actions button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  expect(
    await page.evaluate("document.documentElement.scrollWidth"),
  ).toBeLessThanOrEqual(375);
});

test("a year veto from the dialog hides the game for its vetoer, and Undo restores it", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();
  // A veto only hides a game when its vetoer is among the selected players.
  await page.getByRole("button", { name: "Alice" }).click();

  await page.getByRole("button", { name: "Veto: Delta" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Not in 2024" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(/Vetoed Delta for 2024\./);
  await expect(page.getByRole("link", { name: "Delta" })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: "Delta" })).toBeVisible();
});

test("desktop row buttons stay compact", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();
  const box = await page
    .locator(".tray-row__actions button")
    .first()
    .boundingBox();
  expect(box!.height).toBeLessThan(44);
});

test("a long played-by list collapses and expands in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { members, rows } = longNamedMembers(9);
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

  const list = page.locator(".tray-played-by__list");
  const last = list.getByText("Featherstonehaugh 9");
  const toggle = page.getByRole("button", { name: "+3 more" });
  await expect(toggle).toBeVisible();
  await expect(last).toHaveCount(0);

  await toggle.click();
  await expect(last).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();

  const bottoms = await page
    .locator(".tray-card__foot")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(bottoms).toHaveLength(3);
  for (const bottom of bottoms) {
    expect(Math.abs(bottom - bottoms[0])).toBeLessThanOrEqual(1);
  }
});
