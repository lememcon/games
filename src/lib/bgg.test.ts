import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  describeBggError,
  filterGames,
  incompleteIds,
  isRunning,
  progressPercent,
  toggleAll,
  toggleId,
} from "@/lib/bgg";
import type { BggGameRow, BggJob } from "@/types";

const game = (bggId: number, over: Partial<BggGameRow> = {}): BggGameRow => ({
  bggId,
  name: `Game ${bggId}`,
  years: [2025],
  state: "loaded",
  hasPlayers: true,
  hasImage: true,
  fetchedAt: null,
  ...over,
});

const job = (over: Partial<BggJob> = {}): BggJob => ({
  state: "running",
  mode: "missing",
  total: 10,
  done: 5,
  updated: 5,
  notFound: 0,
  batchesTotal: 1,
  batchesDone: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
  ...over,
});

describe("describeBggError", () => {
  const msg = (status: number, error: string) =>
    describeBggError(new ApiError(status, error));

  it("maps known failures", () => {
    expect(msg(401, "x")).toMatch(/admin access/);
    expect(msg(403, "x")).toMatch(/admin access/);
    expect(msg(429, "cooldown")).toMatch(/few seconds/);
    expect(msg(409, "key_not_set")).toMatch(/Set and verify/);
    expect(msg(409, "job_running")).toMatch(/already running/);
    expect(msg(400, "invalid_key")).toMatch(/1 to 200/);
    expect(msg(400, "invalid_request")).toMatch(/rejected/);
    expect(msg(502, "scores_unavailable")).toMatch(/score data/);
  });

  it("falls back for anything else, without echoing server text", () => {
    expect(msg(500, "secret detail")).toBe("Something went wrong. Try again.");
    expect(msg(409, "other")).toBe("Something went wrong. Try again.");
    expect(describeBggError(new Error("x"))).toBe(
      "Something went wrong. Try again.",
    );
  });
});

describe("games helpers", () => {
  const games = [
    game(1, { name: "Azul" }),
    game(2, { name: "Wingspan", state: "missing" }),
    game(3, { name: "Catan", state: "partial" }),
  ];

  it("lists ids that need a download", () => {
    expect(incompleteIds(games)).toEqual([2, 3]);
  });

  it("filters by name or id", () => {
    expect(filterGames(games, "")).toEqual(games);
    expect(filterGames(games, "  WING ").map((g) => g.bggId)).toEqual([2]);
    expect(filterGames(games, "3").map((g) => g.bggId)).toEqual([3]);
  });

  it("toggles selection", () => {
    expect(toggleId([1], 2)).toEqual([1, 2]);
    expect(toggleId([1, 2], 1)).toEqual([2]);
    expect(toggleAll([1], [1, 2])).toEqual([1, 2]);
    expect(toggleAll([1, 2, 5], [1, 2])).toEqual([5]);
  });
});

describe("job helpers", () => {
  it("reports running and progress", () => {
    expect(isRunning(job())).toBe(true);
    expect(isRunning(job({ state: "done" }))).toBe(false);
    expect(isRunning(undefined)).toBe(false);
    expect(progressPercent(job())).toBe(50);
    expect(progressPercent(job({ done: 99 }))).toBe(100);
    expect(progressPercent(job({ total: 0, state: "idle" }))).toBe(0);
    expect(progressPercent(job({ total: 0, state: "done" }))).toBe(100);
  });
});
