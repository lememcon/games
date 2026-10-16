import { expect, test } from "@playwright/test";

import { aliceId, bobId, mockApi } from "./fixtures";

// Alice played Alpha, Bob played Beta: Gamma and Delta stay #1 picks, while
// Alpha (Bob's #2) and Beta (Alice's #2) drop to the Top 2 tier.
const setup = async (page: Parameters<typeof mockApi>[0]) =>
  mockApi(page, {
    played: ["101"],
    playedByYear: { "2024": { [aliceId]: ["101"], [bobId]: ["102"] } },
  });

test("opens from the year list and groups games into tiers", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/2024");
  await expect(page.getByText("4 of 4 games")).toBeVisible();

  await page.getByRole("link", { name: "Top picks still unplayed" }).click();
  await expect(page).toHaveURL(/\/2024\/top-picks$/);
  await expect(
    page.getByRole("heading", { name: "Top picks still unplayed" }),
  ).toBeVisible();

  const tier1 = page.getByRole("region", { name: "#1 picks" });
  await expect(tier1.getByRole("link", { name: /^(Delta|Gamma)$/ })).toHaveText(
    ["Delta", "Gamma"],
  );
  const tier2 = page.getByRole("region", { name: "Top 2" });
  await expect(tier2.getByRole("link", { name: /^(Alpha|Beta)$/ })).toHaveText([
    "Alpha",
    "Beta",
  ]);
});

test("each game lists every member who picked it with their rank", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/2024/top-picks");

  const delta = page.getByRole("listitem").filter({ hasText: "Delta" }).last();
  await expect(delta.getByText("Alice's #1")).toBeAttached();
  await expect(delta.getByText("Bob's #2")).toBeAttached();

  // Alice already played Alpha: still listed, but only Bob's #2 is unplayed.
  const alpha = page.getByRole("listitem").filter({ hasText: "Alpha" }).last();
  await expect(alpha.getByText("Alice's #1, played")).toBeAttached();
  await expect(alpha.getByText("Bob's #2", { exact: true })).toBeAttached();
});

test("rows fit a phone: no horizontal scroll and badges stay inside", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page);
  await page.goto("/2024/top-picks");
  await expect(page.getByRole("link", { name: "Delta" })).toBeVisible();

  const [scrollWidth, clientWidth] = await page.evaluate<[number, number]>(
    "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
  );
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  const rows = page.locator(".tray-row");
  expect(await rows.count()).toBe(4);
  const fits = await rows.evaluateAll((els) =>
    els.every((row) => {
      const box = row.getBoundingClientRect();
      const cover = row.querySelector(".tray-cover")!.getBoundingClientRect();
      const name = row.querySelector(".tray-name")!.getBoundingClientRect();
      const inside = [...row.querySelectorAll("li")].every((li) => {
        const r = li.getBoundingClientRect();
        return r.left >= box.left && r.right <= box.right;
      });
      // The cover and the name start on the same line.
      return inside && Math.abs(cover.top - name.top) <= 12;
    }),
  );
  expect(fits).toBe(true);
});
