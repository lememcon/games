import { useContext } from "react";

import { PALETTE } from "@/lib/colors";
import { PlayerColorContext } from "@/lib/playerColors";

interface PlayedByListProps {
  playedBy: string[];
}

// Chips for the players who played a game this year, each in the
// player's identity color. Renders nothing when nobody has.
const PlayedByList = ({ playedBy }: PlayedByListProps) => {
  const colors = useContext(PlayerColorContext);
  if (playedBy.length === 0) return null;

  return (
    <ul className="tray-played-by" aria-label="Played by">
      {playedBy.map((name) => (
        <li
          key={name}
          className="tray-played-by__chip"
          style={{ color: colors[name] ?? PALETTE[0] }}
        >
          {name}
        </li>
      ))}
    </ul>
  );
};

export default PlayedByList;
