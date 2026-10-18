import { expect, test } from "@playwright/test";

import type { Me } from "../../src/types";
import { approvedUser, mockApi } from "./fixtures";

const admin: Me = {
  status: "approved",
  user: { ...approvedUser, role: "admin" },
};

test("an import in one tab adds the year to another tab without a reload", async ({
  page,
  context,
}) => {
  const state = await mockApi(context, { me: admin });
  // Registered after mockApi, so it wins over the catch-all.
  await context.route(
    (url) => url.pathname === "/api/admin/import",
    (route) => {
      state.years.push(2025);
      state.scores.push({
        bgg_id: 101,
        game: "Alpha",
        player: "Dana",
        score: 5,
        rank: 1,
      });
      return route.fulfill({
        json: {
          year: 2025,
          scores: 1,
          games: { new: 0, updated: 0 },
          players: { new: 1, total: 4 },
          warnings: [],
        },
      });
    },
  );

  // Tab B: the scoreboard, which does not know 2025 yet.
  await page.goto("/2024");
  await expect(page.getByText("4 of 4 games")).toBeVisible();
  await page.evaluate("window.__noReload = true");
  const year = page.getByRole("combobox");
  await year.click();
  await expect(page.getByRole("option", { name: "2024" })).toBeVisible();
  await expect(page.getByRole("option", { name: "2025" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Tab A: an admin imports 2025.
  const importTab = await context.newPage();
  await importTab.goto("/admin/import");
  await importTab.locator('input[type="file"]').setInputFiles({
    name: "2025.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        year: 2025,
        player_game_scores: [
          { bgg_id: 101, game: "Alpha", player: "Dana", score: 5, rank: 1 },
        ],
      }),
    ),
  });
  await importTab.getByRole("button", { name: "Import 2025" }).click();
  await expect(importTab.getByText(/Imported 2025/)).toBeVisible();

  // Tab B refetches the years on the broadcast.
  await year.click();
  await expect(page.getByRole("option", { name: "2025" })).toBeVisible();
  expect(await page.evaluate("window.__noReload")).toBe(true);
});
