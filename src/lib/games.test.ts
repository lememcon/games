import { describe, expect, it } from "vitest";

import {
  buildSelectedGames,
  computeMaxScores,
  gameBounds,
  realBounds,
  resolveImage,
} from "@/lib/games";
import type { Data, GamesData, PlayerGameScore } from "@/types";

const gameData: GamesData = {
  100: { players: { min: 2, max: 4 } },
  200: { players: { min: 2, max: 2 } },
};

const byPlayer: Record<string, PlayerGameScore[]> = {
  alice: [
    { player: "alice", game: "Root", rank: 1, score: 50, bgg_id: 100 },
    { player: "alice", game: "Chess", rank: 2, score: 30, bgg_id: 200 },
  ],
  bob: [{ player: "bob", game: "Root", rank: 3, score: 40, bgg_id: 100 }],
};

const noPlayed = () => 0;

describe("gameBounds", () => {
  it("reads min/max from metadata", () => {
    expect(gameBounds(gameData, "100")).toEqual({ min: 2, max: 4 });
  });

  it("defaults to 0/99 when the game has no metadata", () => {
    expect(gameBounds(gameData, "999")).toEqual({ min: 0, max: 99 });
  });

  it("defaults when metadata exists but has no players", () => {
    expect(gameBounds({ 5: { image: "x" } }, "5")).toEqual({ min: 0, max: 99 });
  });
});

describe("realBounds", () => {
  it("returns the bounds when both are set", () => {
    expect(realBounds({ players: { min: 1, max: 3 } })).toEqual({
      min: 1,
      max: 3,
    });
  });

  it.each([
    [undefined],
    [{}],
    [{ players: { min: null, max: 4 } }],
    [{ players: { min: 2, max: null } }],
  ])("is null for incomplete metadata %j", (meta) => {
    expect(realBounds(meta)).toBeNull();
  });

  it("makes gameBounds fall back to 0/99 for null bounds", () => {
    expect(
      gameBounds({ 5: { players: { min: null, max: null } } }, "5"),
    ).toEqual({ min: 0, max: 99 });
  });
});

describe("resolveImage", () => {
  const images = { "/src/assets/games/7.png": "bundled.png" };

  it("prefers the bundled file for the id and ext", () => {
    expect(
      resolveImage(
        "7",
        { image: "https://example.com/a.png", ext: ".png" },
        images,
      ),
    ).toBe("bundled.png");
  });

  it("uses the bundled file even when the image URL is null", () => {
    expect(resolveImage("7", { image: null, ext: ".png" }, images)).toBe(
      "bundled.png",
    );
  });

  it("falls back to a valid https URL", () => {
    expect(
      resolveImage(
        "8",
        { image: "https://example.com/a.png", ext: ".png" },
        images,
      ),
    ).toBe("https://example.com/a.png");
  });

  it("falls back to a URL when there is no ext", () => {
    expect(
      resolveImage("8", { image: "https://example.com/a.png" }, images),
    ).toBe("https://example.com/a.png");
  });

  it.each([
    ["http://example.com/a.png"],
    ["javascript:alert(1)"],
    ["data:image/png;base64,AAAA"],
    ["custom"],
    [""],
    [null],
    [undefined],
  ])("returns nothing for the image %j", (image) => {
    expect(resolveImage("8", { image, ext: ".png" }, images)).toBeUndefined();
  });

  it("returns nothing without metadata", () => {
    expect(resolveImage("7", undefined, images)).toBeUndefined();
  });
});

describe("computeMaxScores", () => {
  const data: Data = {
    loading: false,
    scores: [],
    by_game: {},
    by_id: {},
    by_player: { alice: [], bob: [] },
    max: 50,
  };

  it("scales by all players when none are selected", () => {
    expect(computeMaxScores(data, [])).toEqual({
      individualMax: 50,
      selectedMax: 100,
    });
  });

  it("scales by the number of selected players", () => {
    expect(computeMaxScores(data, ["alice"])).toEqual({
      individualMax: 50,
      selectedMax: 50,
    });
  });
});

describe("buildSelectedGames", () => {
  it("aggregates scores across players and sorts descending", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(games.map((g) => [g.name, g.score])).toEqual([
      ["Root", 90],
      ["Chess", 30],
    ]);
  });

  it("records per-player rank and score", () => {
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(root.players).toEqual({
      alice: { name: "alice", rank: 1, score: 50 },
      bob: { name: "bob", rank: 3, score: 40 },
    });
  });

  it("carries a linked player's discord id onto their entry", () => {
    const [root] = buildSelectedGames({
      byPlayer: {
        alice: [
          {
            player: "alice",
            game: "Root",
            rank: 1,
            score: 50,
            bgg_id: 100,
            discord_id: "7",
          },
        ],
      },
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(root.players.alice.discordId).toBe("7");
  });

  it("skips a selected player with no scores", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: ["carol"],
      gameData,
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(games).toEqual([]);
  });

  it("restricts to selected players", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: ["bob"],
      gameData,
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(games.map((g) => g.name)).toEqual(["Root"]);
    expect(games[0].score).toBe(40);
  });

  it("hides games that have been played when hidePlayed is set", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: [],
      gameData,
      images: {},
      hidePlayed: true,
      getPlayedCount: (id) => (id === "100" ? 1 : 0),
    });

    expect(games.map((g) => g.name)).toEqual(["Chess"]);
  });

  it("filters games that cannot fit the selected player count", () => {
    const threePlayers: Record<string, PlayerGameScore[]> = {
      a: [{ player: "a", game: "Duel", rank: 1, score: 10, bgg_id: 200 }],
      b: [{ player: "b", game: "Duel", rank: 2, score: 8, bgg_id: 200 }],
      c: [{ player: "c", game: "Duel", rank: 3, score: 6, bgg_id: 200 }],
    };

    const games = buildSelectedGames({
      byPlayer: threePlayers,
      players: ["a", "b", "c"],
      gameData,
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(games).toEqual([]);
  });

  it("resolves the image path from the injected images map", () => {
    const images = { "/src/assets/games/100.jpg": "root.jpg" };
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData: {
        100: { players: { min: 2, max: 4 }, image: "pic.jpg", ext: ".jpg" },
      },
      images,
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(root.image).toBe("root.jpg");
  });

  it("falls back to an https image URL when nothing is bundled", () => {
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData: {
        100: { image: "https://example.com/root.jpg", ext: ".jpg" },
      },
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(root.image).toBe("https://example.com/root.jpg");
  });

  it("leaves the image out when it cannot be resolved", () => {
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData: { 100: { image: "custom", ext: ".jpg" } },
      images: {},
      hidePlayed: false,
      getPlayedCount: noPlayed,
    });

    expect(root.image).toBeUndefined();
  });
});
