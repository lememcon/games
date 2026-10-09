import { describe, expect, it } from "vitest";

import { groupByMember } from "@/lib/playerLinks";
import type { LinkableUser, PlayerLink } from "@/types";

const player = (id: number, over: Partial<PlayerLink> = {}): PlayerLink => ({
  id,
  name: `p${id}`,
  scoreCount: 0,
  discordId: null,
  userName: null,
  ...over,
});
const users: LinkableUser[] = [
  { discordId: "10", name: "Kelsin", status: "approved" },
  { discordId: "20", name: "dana", status: "pending" },
];

describe("groupByMember", () => {
  it("separates unlinked players and groups a member's names", () => {
    const { members, unlinked } = groupByMember(
      [
        player(1),
        player(2, { discordId: "10" }),
        player(3, { discordId: "20" }),
        player(4, { discordId: "10" }),
      ],
      users,
    );
    expect(unlinked.map((p) => p.id)).toEqual([1]);
    expect(members.map((m) => [m.label, m.players.map((p) => p.id)])).toEqual([
      ["dana", [3]],
      ["Kelsin", [2, 4]],
    ]);
  });

  it("gives a member with no login row its own group labelled by userName or id", () => {
    const { members } = groupByMember(
      [
        player(1, { discordId: "98", userName: "Ghost" }),
        player(2, { discordId: "99" }),
      ],
      [],
    );
    expect(members.map((m) => m.label)).toEqual(["99", "Ghost"]);
  });

  it("orders members with equal labels by id", () => {
    const { members } = groupByMember(
      [player(1, { discordId: "2" }), player(2, { discordId: "1" })],
      [
        { discordId: "1", name: "Sam", status: "approved" },
        { discordId: "2", name: "sam", status: "approved" },
      ],
    );
    expect(members.map((m) => m.discordId)).toEqual(["1", "2"]);
  });

  it("returns nothing for no players", () => {
    expect(groupByMember([], users)).toEqual({ members: [], unlinked: [] });
  });
});
