import { describe, expect, it } from "vitest";

import { markPlayedOptions } from "@/lib/markPlayed";
import type { PlayerGameScore } from "@/types";

const row = (player: string, discord_id?: string): PlayerGameScore => ({
  bgg_id: 11,
  game: "Azul",
  player,
  score: 1,
  rank: 1,
  ...(discord_id ? { discord_id } : {}),
});

const byPlayer = {
  bob: [row("bob", "2"), row("bob", "2")],
  Alice: [row("Alice", "1")],
  Cara: [row("Cara")],
  eve: [row("eve", "5")],
};

const input = {
  byPlayer,
  bggId: "11",
  selfId: "1",
  selfName: "Alice",
  playedByDiscord: {},
};

describe("markPlayedOptions", () => {
  it("sorts players by name and selects only the member", () => {
    const { options, selected } = markPlayedOptions(input);
    expect(options.map((o) => o.name)).toEqual(["Alice", "bob", "Cara", "eve"]);
    expect(selected).toEqual(["1"]);
  });

  it("disables players without an account", () => {
    const cara = markPlayedOptions(input).options.find(
      (o) => o.name === "Cara",
    );
    expect(cara).toEqual({
      name: "Cara",
      discordId: null,
      disabled: true,
      reason: "no account",
    });
  });

  it("disables players who already played the game", () => {
    const { options } = markPlayedOptions({
      ...input,
      playedByDiscord: { "2": { "11": 1 }, "5": { "12": 1 } },
    });
    expect(options.find((o) => o.name === "bob")).toMatchObject({
      disabled: true,
      reason: "already played",
    });
    expect(options.find((o) => o.name === "eve")?.disabled).toBe(false);
  });

  it("does not select a member who already played", () => {
    const { options, selected } = markPlayedOptions({
      ...input,
      playedByDiscord: { "1": { "11": 1 } },
    });
    expect(options.find((o) => o.discordId === "1")?.disabled).toBe(true);
    expect(selected).toEqual([]);
  });

  it("adds the member when the year's data lacks them", () => {
    const { options, selected } = markPlayedOptions({
      ...input,
      selfId: "9",
      selfName: "Zed",
    });
    expect(options.map((o) => o.name)).toContain("Zed");
    expect(selected).toEqual(["9"]);
  });

  it("lists a member once even under two names", () => {
    const { options } = markPlayedOptions({
      ...input,
      byPlayer: { ...byPlayer, Al: [row("Al", "1")] },
    });
    expect(options.filter((o) => o.discordId === "1")).toHaveLength(1);
  });
});
