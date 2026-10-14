import { Fragment } from "react";

import PlayerName from "@/components/PlayerName";
import { groupRanks } from "@/lib/groupRank";
import type { SelectedGame } from "@/types";

// "group rank: #1 <name> (global N) · #2 ..." ranking only the game's group
// members by score. Renders nothing with fewer than two scorers.
const GroupRank = ({ game }: { game: SelectedGame }) => {
  const ranks = groupRanks(game);
  if (!ranks) return null;

  const ordered = Object.values(game.players).sort(
    (a, b) => ranks[a.name] - ranks[b.name] || a.name.localeCompare(b.name),
  );

  return (
    <span className="tray-meta">
      group rank:{" "}
      {ordered.map((p, i) => (
        <Fragment key={p.name}>
          {i > 0 && " · "}#{ranks[p.name]}{" "}
          <PlayerName
            name={p.name}
            discordId={p.discordId}
            image={p.discordImage}
          />{" "}
          (global {p.rank})
        </Fragment>
      ))}
    </span>
  );
};

export default GroupRank;
