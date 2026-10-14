import PlayerName from "@/components/PlayerName";
import type { SelectedGame } from "@/types";
import { normalized_score } from "@/util";

interface LeastHappyProps {
  game: SelectedGame;
  name: string;
  individualMax: number;
}

// "least happy: <name> (<score>)" for the game's lowest-ranked scorer. The
// score is omitted when it can't be computed.
const LeastHappy = ({ game, name, individualMax }: LeastHappyProps) => {
  const player = game.players[name];
  return (
    <span className="tray-meta">
      least happy:{" "}
      <PlayerName
        name={name}
        discordId={player?.discordId}
        image={player?.discordImage}
      />
      {player && individualMax > 0 && (
        <> ({normalized_score(player.score, individualMax).toFixed(1)})</>
      )}
    </span>
  );
};

export default LeastHappy;
