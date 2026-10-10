import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import YearRecap from "@/components/YearRecap";
import type { MemberPlayedState } from "@/hooks/useMemberPlayed";
import type { ProfileState } from "@/hooks/useProfile";
import { renderWithMantine } from "@/test/utils";
import type { Data, PlayerGameScore } from "@/types";

const h = vi.hoisted(() => ({
  years: { years: [] as string[], loading: false, error: false },
  data: {} as unknown,
  games: { games: {}, loading: false, error: false },
  profile: { status: "loading" } as unknown,
  played: { status: "loading" } as unknown,
  useYears: vi.fn(),
  useData: vi.fn(),
  useMemberPlayed: vi.fn(),
  useProfile: vi.fn(),
}));
vi.mock("@/hooks/useYears", () => ({
  default: () => {
    h.useYears();
    return h.years;
  },
}));
vi.mock("@/hooks/useGames", () => ({ default: () => h.games }));
vi.mock("@/hooks/useData", () => ({
  default: (y: string) => {
    h.useData(y);
    return h.data;
  },
}));
vi.mock("@/hooks/useProfile", () => ({
  default: (id: string) => {
    h.useProfile(id);
    return h.profile;
  },
}));
vi.mock("@/hooks/useMemberPlayed", () => ({
  default: (...args: unknown[]) => {
    h.useMemberPlayed(...args);
    return h.played;
  },
}));

const row = (
  bgg_id: number,
  game: string,
  player: string,
  score: number,
  rank: number,
  discord_id?: string,
): PlayerGameScore => ({ bgg_id, game, player, score, rank, discord_id });

const scores: PlayerGameScore[] = [
  row(1, "Azul", "Ana", 96, 1, "me"),
  row(2, "Heat", "Ana", 80, 2, "me"),
  row(3, "Root", "Ana", 70, 3, "me"),
  row(1, "Azul", "Bo", 50, 2),
  row(2, "Heat", "Bo", 60, 1),
];

const dataFor = (rows: PlayerGameScore[]): Data => {
  const by_player: Data["by_player"] = {};
  for (const { player, ...rest } of rows) {
    (by_player[player] ??= []).push({ player, ...rest });
  }
  return {
    loading: false,
    scores: rows,
    by_game: {},
    by_player,
    by_id: {},
    max: 100,
  };
};

const ready = (over: Partial<MemberPlayedState> = {}): MemberPlayedState =>
  ({
    status: "ready",
    byYear: { "2025": { "1": 2 }, "2024": { "2": 1 } },
    allCounts: { me: { "1": 2 }, bo: { "1": 1, "2": 4 } },
    ...over,
  }) as MemberPlayedState;

const profile = (stats: unknown = {}): ProfileState => ({
  status: "ready",
  profile: {
    discordId: "me",
    name: "Ana",
    image: null,
    linkedPlayers: ["Ana"],
    stats,
    totalPlays: 3,
  } as never,
});

const show = (year = "2025") =>
  renderWithMantine(<YearRecap discordId="me" year={year} />);

beforeEach(() => {
  vi.clearAllMocks();
  h.years = { years: ["2023", "2024", "2025"], loading: false, error: false };
  h.data = dataFor(scores);
  h.games = { games: {}, loading: false, error: false };
  h.profile = profile();
  h.played = ready();
});

describe("YearRecap", () => {
  it("shows a loader while the years load and fetches nothing", () => {
    h.years = { years: [], loading: true, error: false };
    show();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(h.useData).not.toHaveBeenCalled();
    expect(h.useMemberPlayed).not.toHaveBeenCalled();
    expect(h.useProfile).not.toHaveBeenCalled();
  });

  it("reports a years failure", () => {
    h.years = { years: [], loading: false, error: true };
    show();
    expect(screen.getByText("Couldn't load this recap")).toBeInTheDocument();
  });

  it.each(["abcd", "1999", "20255"])("shows not found for %s", (year) => {
    show(year);
    expect(screen.getByText("Year not found")).toBeInTheDocument();
    expect(h.useData).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", () => (h.profile = { status: "error" })],
    ["played", () => (h.played = { status: "error" })],
    ["data", () => (h.data = { ...(h.data as object), error: true })],
    ["games", () => (h.games = { games: {}, loading: false, error: true })],
  ])("reports a %s failure", (_, fail) => {
    fail();
    show();
    expect(screen.getByText("Couldn't load this recap")).toBeInTheDocument();
  });

  it("explains a missing profile", () => {
    h.profile = { status: "not_found" };
    show();
    expect(screen.getByText("Profile not found")).toBeInTheDocument();
  });

  it.each([
    ["profile", () => (h.profile = { status: "loading" })],
    ["played", () => (h.played = { status: "loading" })],
    ["data", () => (h.data = { ...(h.data as object), loading: true })],
    ["games", () => (h.games = { games: {}, loading: true, error: false })],
  ])("shows only a loader while %s loads", (_, wait) => {
    wait();
    show();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("asks for the year and earlier years", () => {
    show();
    expect(h.useData).toHaveBeenCalledWith("2025");
    expect(h.useProfile).toHaveBeenCalledWith("me");
    expect(h.useMemberPlayed).toHaveBeenCalledTimes(1);
    expect(h.useMemberPlayed).toHaveBeenNthCalledWith(1, "me", "2025", [
      "2023",
      "2024",
    ]);
  });

  it("loads the years once, in the outer component only", () => {
    show();
    expect(h.useYears).toHaveBeenCalledTimes(1);
  });

  it("says so when the year has no scores", () => {
    h.data = dataFor([]);
    show();
    expect(screen.getByText("No scores for 2025")).toBeInTheDocument();
  });

  it("lists unplayed top games with links and new picks", () => {
    show();
    expect(
      screen.getByRole("heading", { name: "Ana's 2025 in review" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 game played · 1 new pick")).toBeInTheDocument();
    // Azul was played; Heat and Root were not.
    expect(screen.getByRole("link", { name: "Heat" })).toHaveAttribute(
      "href",
      "/2025/games/2",
    );
    expect(screen.getByRole("link", { name: "Root" })).toBeInTheDocument();
    expect(screen.getAllByText("0 plays")).toHaveLength(2);
    // Azul is a new pick (nothing earlier), not in the unplayed list.
    expect(screen.getAllByRole("link", { name: "Azul" })).toHaveLength(1);
    expect(screen.getByText("first played 2025")).toBeInTheDocument();
  });

  it("only lists games from the scoreboard's top 10", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      row(100 + i, `Game ${i}`, "Ana", 50 - i, i + 1, "me"),
    );
    h.data = dataFor(many);
    h.played = ready({ byYear: { "2025": {}, "2024": {} } } as never);
    show();
    expect(screen.getByRole("link", { name: "Game 9" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Game 10" })).toBeNull();
  });

  it("says when every top game was played", () => {
    h.played = ready({
      byYear: { "2025": { "1": 1, "2": 1, "3": 1 }, "2024": { "9": 1 } },
    } as never);
    show();
    expect(
      screen.getByText("Ana played every game in the top."),
    ).toBeInTheDocument();
  });

  it("shows a note when there are no earlier years with data", () => {
    h.played = ready({ byYear: { "2025": { "1": 1 }, "2024": {} } } as never);
    show();
    expect(
      screen.getByText("No earlier years to compare with."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/new pick/)).toBeNull();
    expect(screen.queryByText(/^Versus/)).toBeNull();
  });

  it("says when nothing was played for the first time", () => {
    h.played = ready({
      byYear: { "2025": { "1": 1 }, "2024": { "1": 1 } },
    } as never);
    show();
    expect(
      screen.getByText("No games were played for the first time."),
    ).toBeInTheDocument();
  });

  it("shows every fun fact", () => {
    h.data = dataFor([...scores, row(9, "Wingspan", "Bo", 10, 3)]);
    h.played = ready({
      byYear: { "2025": { "1": 2, "9": 1 }, "2024": { "1": 1 } },
      allCounts: { me: { "1": 2, "9": 1 }, bo: { "2": 5, "1": 1 } },
    } as never);
    show();
    expect(screen.getByText("Fun facts")).toBeInTheDocument();
    expect(screen.getByText("3, group average 4.5")).toBeInTheDocument();
    expect(screen.getByText("Azul, 2 plays")).toBeInTheDocument();
    expect(screen.getByText("1 (Azul)")).toBeInTheDocument();
    expect(screen.getByText("96 for Azul")).toBeInTheDocument();
    expect(screen.getByText("Heat, 5 plays (Ana: 0)")).toBeInTheDocument();
    expect(screen.getByText("Only Ana played")).toBeInTheDocument();
    expect(screen.getAllByText("Wingspan")[0]).toBeInTheDocument();
    expect(screen.getByText("Versus 2024")).toBeInTheDocument();
    expect(screen.getByText("2 games, up 1")).toBeInTheDocument();
    expect(screen.queryByText(/wins|first place/i)).toBeNull();
  });

  it("omits facts that have no value", () => {
    h.data = dataFor([row(1, "Azul", "Bo", 50, 2)]);
    h.played = ready({
      byYear: { "2025": {}, "2024": {} },
      allCounts: { bo: { "1": 1 } },
    } as never);
    show();
    expect(screen.getByText("Fun facts")).toBeInTheDocument();
    expect(screen.getByText("0, group average 1")).toBeInTheDocument();
    for (const gone of [
      "Most played",
      "Your #1 picks",
      "Highest rating",
      "Only Ana played",
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.getByText("Group favourite")).toBeInTheDocument();
  });

  it("hides the block when no fact has a value", () => {
    h.data = dataFor([row(1, "", "Bo", 50, 2)]);
    h.played = ready({
      byYear: { "2025": {}, "2024": {} },
      allCounts: {},
    } as never);
    show();
    expect(screen.queryByText("Fun facts")).toBeNull();
  });

  it("describes a decrease, no change and long lists", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      row(20 + i, `G${i}`, "Ana", 5, 4, "me"),
    );
    h.data = dataFor(many);
    const mine = Object.fromEntries(many.map((m) => [`${m.bgg_id}`, 1]));
    h.played = ready({
      byYear: { "2025": mine, "2024": { ...mine, "99": 1, "98": 1 } },
      allCounts: { me: mine },
    } as never);
    const { unmount } = show();
    expect(screen.getByText("7 games, down 2")).toBeInTheDocument();
    expect(
      screen.getByText("G0, G1, G2, G3, G4 and 2 more"),
    ).toBeInTheDocument();
    unmount();
    h.played = ready({
      byYear: { "2025": mine, "2024": mine },
      allCounts: { me: mine },
    } as never);
    show();
    expect(screen.getByText("7 games, no change")).toBeInTheDocument();
  });

  it("still renders for a member with no linked stats", () => {
    h.profile = profile(null);
    h.data = dataFor([row(1, "Azul", "Bo", 50, 2)]);
    show();
    expect(
      screen.getByRole("heading", { name: "Ana's 2025 in review" }),
    ).toBeInTheDocument();
  });
});
