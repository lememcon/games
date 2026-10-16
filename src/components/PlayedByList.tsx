import { useId, useState } from "react";

import PlayerName from "@/components/PlayerName";
import { capPlayedBy } from "@/lib/playedBy";
import type { PlayedByPlayer } from "@/types";

interface PlayedByListProps {
  playedBy: PlayedByPlayer[];
  // Defaults to "Played by".
  label?: string;
}

// A labelled list of players (label defaults to "Played by"), each as avatar
// and name. Renders nothing when the list is empty.
const PlayedByList = ({ playedBy, label = "Played by" }: PlayedByListProps) => {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (playedBy.length === 0) return null;

  const { shown, hidden } = capPlayedBy(playedBy);
  const visible = expanded ? playedBy : shown;

  return (
    <div className="tray-played-by">
      <span className="tray-played-by__label" aria-hidden="true">
        {label}:
      </span>
      <ul id={listId} className="tray-played-by__list" aria-label={label}>
        {visible.map(({ name, discordId, discordImage }) => (
          <li key={name}>
            <PlayerName
              name={name}
              discordId={discordId}
              image={discordImage}
            />
          </li>
        ))}
        {hidden > 0 && (
          <li key="toggle">
            <button
              type="button"
              className="tray-played-by__toggle"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? "Show less" : `+${hidden} more`}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};

export default PlayedByList;
