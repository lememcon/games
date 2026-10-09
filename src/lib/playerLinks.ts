import type { LinkableUser, PlayerLink } from "@/types";

export interface MemberGroup {
  discordId: string;
  /** Member name; falls back to the Discord id when there is no login row. */
  label: string;
  players: PlayerLink[];
}

/**
 * Groups linked players by member (by label, then id) and returns the
 * unlinked remainder. Player order within each part is kept. A member with
 * no login row still gets a group.
 */
export function groupByMember(
  players: readonly PlayerLink[],
  users: readonly LinkableUser[],
): { members: MemberGroup[]; unlinked: PlayerLink[] } {
  const names = new Map(users.map((u) => [u.discordId, u.name]));
  const groups = new Map<string, MemberGroup>();
  const unlinked: PlayerLink[] = [];
  for (const p of players) {
    if (p.discordId === null) {
      unlinked.push(p);
      continue;
    }
    const group = groups.get(p.discordId) ?? {
      discordId: p.discordId,
      label: names.get(p.discordId) ?? p.userName ?? p.discordId,
      players: [],
    };
    group.players.push(p);
    groups.set(p.discordId, group);
  }
  const members = [...groups.values()].sort(
    (a, b) =>
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.discordId.localeCompare(b.discordId),
  );
  return { members, unlinked };
}
