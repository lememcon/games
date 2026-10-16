import { describe, expect, it } from "vitest";

import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  gameMeta,
  pageMeta,
  playerMeta,
  recapMeta,
  scoreboardMeta,
  topPicksMeta,
  yearMeta,
} from "@/lib/pageMeta";
import html from "../../index.html?raw";

describe("pageMeta", () => {
  it("keeps the default description in step with index.html", () => {
    expect(html).toContain(`content="${DEFAULT_DESCRIPTION}"`);
  });

  it("falls back to the site name, default description and no path", () => {
    expect(pageMeta()).toEqual({
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      path: null,
    });
  });

  it("suffixes a title with the site name", () => {
    expect(pageMeta({ title: "Admin" }).title).toBe("Admin | Lememcon Games");
  });

  it("strips the query, hash and trailing slash from the path", () => {
    expect(pageMeta({ path: "/2025/?players=a#top" }).path).toBe("/2025");
    expect(pageMeta({ path: "/" }).path).toBe("/");
    expect(pageMeta({ path: "?x=1" }).path).toBe("/");
    expect(pageMeta({ path: "2025" }).path).toBe("/2025");
  });
});

describe("builders", () => {
  it("builds a year", () => {
    expect(yearMeta("2025")).toEqual({
      title: "2025 scores | Lememcon Games",
      description: "Board game scores and rankings for LememCon 2025.",
      path: "/2025",
    });
  });

  it("builds a game", () => {
    expect(gameMeta("2025", 11, "Belfort")).toEqual({
      title: "Belfort, 2025 scores | Lememcon Games",
      description: "Belfort scores and rankings for LememCon 2025.",
      path: "/2025/games/11",
    });
  });

  it("builds a player", () => {
    expect(playerMeta("Alice", "d 1")).toEqual({
      title: "Alice | Lememcon Games",
      description: "Alice's LememCon profile.",
      path: "/players/d%201",
    });
  });

  it("builds a recap", () => {
    expect(recapMeta("Alice", "d1", "2025")).toEqual({
      title: "Alice's 2025 in review | Lememcon Games",
      description: "Alice's LememCon 2025 in review.",
      path: "/players/d1/recap/2025",
    });
  });
});

describe("scoreboardMeta", () => {
  const base = {
    routeYear: "2025" as string | null,
    gameId: undefined as string | undefined,
    yearKnown: true,
    yearsLoading: false,
    loaded: true,
    gameName: undefined as string | undefined,
  };

  it("uses the default off a year route", () => {
    expect(scoreboardMeta({ ...base, routeYear: null })).toEqual(pageMeta());
  });

  it("uses the default for an unknown year", () => {
    expect(scoreboardMeta({ ...base, yearKnown: false })).toEqual(pageMeta());
  });

  it("claims the year while the list of years loads", () => {
    expect(
      scoreboardMeta({ ...base, yearKnown: false, yearsLoading: true }),
    ).toEqual(yearMeta("2025"));
  });

  it("uses the year for a year page", () => {
    expect(scoreboardMeta(base)).toEqual(yearMeta("2025"));
  });

  it("uses the year while a game loads", () => {
    expect(
      scoreboardMeta({ ...base, gameId: "11", loaded: false, gameName: "x" }),
    ).toEqual(yearMeta("2025"));
  });

  it("gives an unknown game the year title and the game path", () => {
    expect(scoreboardMeta({ ...base, gameId: "99" })).toEqual({
      ...yearMeta("2025"),
      path: "/2025/games/99",
    });
  });

  it("uses the game once loaded", () => {
    expect(
      scoreboardMeta({ ...base, gameId: "11", gameName: "Belfort" }),
    ).toEqual(gameMeta("2025", "11", "Belfort"));
  });

  it("uses the top picks page", () => {
    expect(scoreboardMeta({ ...base, page: "topPicks" })).toEqual(
      topPicksMeta("2025"),
    );
    expect(topPicksMeta("2025")).toMatchObject({
      title: "2025 top picks | Lememcon Games",
      path: "/2025/top-picks",
    });
  });
});
