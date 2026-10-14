import PlayerName from "@/components/PlayerName";
import type { PlayedByPlayer } from "@/types";

interface PlayedByListProps {
  playedBy: PlayedByPlayer[];
}

// A "Played by:" label and the players who played a game this year, each as
// avatar and name. Renders nothing when nobody has.
const PlayedByList = ({ playedBy }: PlayedByListProps) => {
  if (playedBy.length === 0) return null;

  return (
    <div className="tray-played-by">
      <span className="tray-played-by__label" aria-hidden="true">
        Played by:
      </span>
      <ul className="tray-played-by__list" aria-label="Played by">
        {playedBy.map(({ name, discordId, discordImage }) => (
          <li key={name}>
            <PlayerName
              name={name}
              discordId={discordId}
              image={discordImage}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PlayedByList;
