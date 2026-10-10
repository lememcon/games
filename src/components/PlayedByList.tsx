import { useContext } from "react";

import { PALETTE } from "@/lib/colors";
import { PlayerColorContext } from "@/lib/playerColors";

interface PlayedByListProps {
  playedBy: Record<string, number>;
}

// Chips for the players who played a game this year ("Ann ×3"), each in the
// player's identity color. Renders nothing when nobody has.
const PlayedByList = ({ playedBy }: PlayedByListProps) => {
  const colors = useContext(PlayerColorContext);
  const entries = Object.entries(playedBy);
  if (entries.length === 0) return null;

  return (
    <ul className="tray-played-by" aria-label="Played by">
      {entries.map(([name, count]) => (
        <li
          key={name}
          className="tray-played-by__chip"
          style={{ color: colors[name] ?? PALETTE[0] }}
        >
          {name} ×{count}
        </li>
      ))}
    </ul>
  );
};

export default PlayedByList;
