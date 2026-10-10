import type { ReactNode } from "react";

import GameCard from "@/components/GameCard";
import GameRow from "@/components/GameRow";
import { originalBounds, realBounds } from "@/lib/games";
import type { GamesData, SelectedGame } from "@/types";

interface GamesListProps {
  games: SelectedGame[];
  year: string;
  selectedMax: number;
  individualMax: number;
  gameData: GamesData;
  getPlayedCount: (id: string) => number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  // Rendered between the podium and the remaining rows.
  afterPodium?: ReactNode;
}

// Only show real bounds; games missing metadata leave the range blank rather
// than printing the 0-99 default.
const boundsFor = (gameData: GamesData, game: SelectedGame) =>
  realBounds(gameData[game.id]);

// The ranked list: the top three as podium GameCards, everyone else as compact
// GameRows. Rank is the game's position in the already-sorted list.
const GamesList = ({
  games,
  year,
  selectedMax,
  individualMax,
  gameData,
  getPlayedCount,
  onInc,
  onDec,
  afterPodium,
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
            year={year}
            rank={i + 1}
            selectedMax={selectedMax}
            individualMax={individualMax}
            bounds={boundsFor(gameData, game)}
            original={originalBounds(gameData[game.id])}
            played={getPlayedCount(game.id)}
            onInc={() => onInc(game.id)}
            onDec={() => onDec(game.id)}
          />
        ))}
      </div>

      {afterPodium}

      {rest.length > 0 && (
        <div className="tray-rows">
          {rest.map((game, i) => (
            <GameRow
              key={game.name}
              game={game}
              year={year}
              rank={i + 4}
              selectedMax={selectedMax}
              individualMax={individualMax}
              bounds={boundsFor(gameData, game)}
              original={originalBounds(gameData[game.id])}
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
