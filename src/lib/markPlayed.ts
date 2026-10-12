import type { PlayerGameScore } from "@/types";
import type { PlayedMap } from "./played";

export interface MarkPlayedOption {
  name: string;
  discordId: string | null;
  disabled: boolean;
  reason?: "already played" | "no account";
}

interface MarkPlayedInput {
  byPlayer: Record<string, PlayerGameScore[]>;
  bggId: string;
  selfId: string;
  selfName: string;
  playedByDiscord: Record<string, PlayedMap>;
}

/**
 * The dialog's players for one game: everyone in the year, sorted by name.
 * Players without a linked member and members who already played it are
 * disabled. Only the signed-in member is selected, and only when they can be.
 */
export function markPlayedOptions({
  byPlayer,
  bggId,
  selfId,
  selfName,
  playedByDiscord,
}: MarkPlayedInput): { options: MarkPlayedOption[]; selected: string[] } {
  const found = new Map<string | null, string>();
  const unlinked: string[] = [];
  for (const [name, rows] of Object.entries(byPlayer)) {
    const discordId = rows.find((r) => r.discord_id)?.discord_id;
    if (discordId) found.set(discordId, name);
    else unlinked.push(name);
  }
  if (!found.has(selfId)) found.set(selfId, selfName);

  const options: MarkPlayedOption[] = [
    ...[...found].map(([discordId, name]): MarkPlayedOption => {
      const played = !!playedByDiscord[discordId!]?.[bggId];
      return {
        name,
        discordId,
        disabled: played,
        ...(played ? { reason: "already played" as const } : {}),
      };
    }),
    ...unlinked.map((name): MarkPlayedOption => ({
      name,
      discordId: null,
      disabled: true,
      reason: "no account",
    })),
  ].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const self = options.find((o) => o.discordId === selfId);
  return { options, selected: self && !self.disabled ? [selfId] : [] };
}
