import GameCard from "@/components/GameCard";
import GameRow from "@/components/GameRow";
import type { GamesData, SelectedGame } from "@/types";

interface GamesListProps {
  games: SelectedGame[];
  selectedMax: number;
  individualMax: number;
  gameData: GamesData;
  getPlayedCount: (id: string) => number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
}

// Only show real bounds; games missing metadata leave the range blank rather
// than printing the 0-99 default.
const boundsFor = (gameData: GamesData, game: SelectedGame) => {
  const meta = gameData[game.id];
  return meta && meta.players
    ? { min: meta.players.min, max: meta.players.max }
    : null;
};

// The ranked list: the top three as podium GameCards, everyone else as compact
// GameRows. Rank is the game's position in the already-sorted list.
const GamesList = ({
  games,
  selectedMax,
  individualMax,
  gameData,
  getPlayedCount,
  onInc,
  onDec,
}: GamesListProps) => {
  const podium = games.slice(0, 3);
  const rest = games.slice(3);

  return (
    <div className="tray-list">
      <div className="tray-podium">
        {podium.map((game, i) => (
          <GameCard
            key={game.name}
            game={game}
            rank={i + 1}
            selectedMax={selectedMax}
            individualMax={individualMax}
            bounds={boundsFor(gameData, game)}
            played={getPlayedCount(game.id)}
            onInc={() => onInc(game.id)}
            onDec={() => onDec(game.id)}
          />
        ))}
      </div>

      {rest.length > 0 && (
        <div className="tray-rows">
          {rest.map((game, i) => (
            <GameRow
              key={game.name}
              game={game}
              rank={i + 4}
              selectedMax={selectedMax}
              individualMax={individualMax}
              bounds={boundsFor(gameData, game)}
              played={getPlayedCount(game.id)}
              onInc={() => onInc(game.id)}
              onDec={() => onDec(game.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default GamesList;
