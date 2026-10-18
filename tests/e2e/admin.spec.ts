import { expect, test, type Page, type Route } from "@playwright/test";

import type {
  AdminUser,
  BggStatus,
  CoverStatus,
  PlayerLinks,
  Role,
} from "../../src/types";
import { aliceId, approvedUser, mockApi } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 } });

const longName = "B".repeat(60);
const longGame = "Twilight Imperium Fourth Edition Prophecy of Kings Deluxe";

const adminUser = { ...approvedUser, role: "admin" as Role };

const users: AdminUser[] = [
  {
    discordId: aliceId,
    name: longName,
    displayName: "D".repeat(60),
    image: null,
    username: "u".repeat(50),
    role: "admin",
    status: "approved",
    locked: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    discordId: "100000000000000002",
    name: "Bob",
    displayName: null,
    image: null,
    username: "bob",
    role: "member",
    status: "approved",
    locked: false,
    createdAt: "2024-01-02T00:00:00Z",
  },
];

const links: PlayerLinks = {
  players: [
    { id: 1, name: longName, scoreCount: 3, discordId: aliceId, userName: "A" },
    { id: 2, name: "Cara", scoreCount: 2, discordId: null, userName: null },
  ],
  users: [{ discordId: aliceId, name: longName, status: "approved" }],
};

const bggStatus: BggStatus = {
  keyConfigured: true,
  totals: { needed: 2, loaded: 1, missing: 1, partial: 0 },
  games: [
    {
      bggId: 101,
      name: longGame,
      years: [2023, 2024],
      state: "loaded",
      hasPlayers: true,
      hasImage: true,
      fetchedAt: null,
    },
    {
      bggId: 102,
      name: "Beta",
      years: [2024],
      state: "missing",
      hasPlayers: false,
      hasImage: false,
      fetchedAt: null,
    },
  ],
  job: {
    state: "failed",
    mode: "missing",
    total: 2,
    done: 1,
    updated: 1,
    notFound: 0,
    batchesTotal: 1,
    batchesDone: 1,
    errors: ["E".repeat(120)],
    startedAt: null,
    finishedAt: null,
  },
};

const coverStatus: CoverStatus = {
  configured: true,
  coverBaseUrl: null,
  pending: 2,
  job: {
    state: "failed",
    mode: "missing",
    total: 2,
    done: 1,
    mirrored: 1,
    failed: 1,
    errors: ["C".repeat(120)],
    startedAt: null,
    finishedAt: null,
  },
};

const json = (route: Route, body: unknown) => route.fulfill({ json: body });

const setup = async (page: Page) => {
  await mockApi(page, { me: { status: "approved", user: adminUser } });
  const mock = (path: string, body: unknown) =>
    page.route(
      (url) => url.pathname === path,
      (route) => json(route, body),
    );
  await mock("/api/admin/users", users);
  await mock("/api/admin/player-links", links);
  await mock("/api/admin/bgg/key", {
    configured: true,
    masked: "k".repeat(60),
    updatedAt: null,
  });
  await mock("/api/admin/bgg/status", bggStatus);
  await mock("/api/admin/covers/status", coverStatus);
  await mock("/api/admin/cover-storage", {
    source: "admin",
    configured: true,
    bucket: "b".repeat(60),
    region: "us-east-1",
    endpoint: null,
    coverBaseUrl: `https://${"c".repeat(60)}.example.com`,
    accessKeyId: "••••AB12",
    secretSet: true,
    updatedAt: null,
  });
};

const expectNoOverflow = async (page: Page) => {
  const [scrollWidth, clientWidth] = await page.evaluate<[number, number]>(
    "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
  );
  expect(scrollWidth, `scrollWidth ${scrollWidth}`).toBeLessThanOrEqual(
    clientWidth,
  );
};

test("admin page does not overflow horizontally", async ({ page }) => {
  await setup(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Manage members" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Board Game Geek data" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: `Add a name for ${longName}` }),
  ).toBeVisible();
  await expect(page.getByText("E".repeat(120))).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cover images" }),
  ).toBeVisible();
  await expect(page.getByText("C".repeat(120))).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cover storage" }),
  ).toBeVisible();
  await expectNoOverflow(page);
});

test("admin import does not overflow horizontally", async ({ page }) => {
  await setup(page);
  await page.goto("/admin/import");
  await expect(
    page.getByRole("heading", { name: "Import scores" }),
  ).toBeVisible();
  await expectNoOverflow(page);
});
