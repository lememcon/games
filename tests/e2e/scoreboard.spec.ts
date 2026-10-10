import { expect, test } from "@playwright/test";

import { gameOrder, mockApi, overriddenGames } from "./fixtures";

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

test("played counter updates and saves to the server", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  const put = page.waitForRequest(
    (req) =>
      req.method() === "PUT" &&
      new URL(req.url()).pathname === "/api/me/played/2024/101",
  );
  await expect(page.getByText("Not Played")).toHaveCount(4);
  // Alpha is ranked first, so its stepper is the first one.
  await page.getByRole("button", { name: "+" }).first().click();

  await expect(page.getByText("Played 1×")).toBeVisible();
  await expect(page.getByText("Not Played")).toHaveCount(3);
  expect((await put).postDataJSON()).toEqual({ count: 1 });
});

test("a restricted player count filters by the override and shows BGG's range", async ({
  page,
}) => {
  await mockApi(page, { games: overriddenGames });
  await page.goto("/");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  await expect(page.locator("s")).toHaveText("2-4");
  await expect(page.getByText("(restricted from 2-4)")).toBeAttached();

  // Alice and Bob make two players: Delta (now 4 only) drops out.
  await page.getByRole("button", { name: "Alice" }).click();
  await page.getByRole("button", { name: "Bob" }).click();
  await expect(page.getByText("3 of 4 games")).toBeVisible();
  await expect(page.getByRole("link", { name: "Delta" })).toHaveCount(0);
});
