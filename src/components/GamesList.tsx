import type { ReactNode } from "react";

import GameCard from "@/components/GameCard";
import GameRow from "@/components/GameRow";
import type { VetoesState } from "@/hooks/useVetoes";
import { leastHappyPlayer, realBounds } from "@/lib/games";
import type { GamesData, SelectedGame } from "@/types";

interface GamesListProps {
  games: SelectedGame[];
  year: string;
  selectedMax: number;
  individualMax: number;
  gameData: GamesData;
  isPlayed: (id: string) => boolean;
  onToggle: (id: string) => void;
  // Rendered between the podium and the remaining rows.
  afterPodium?: ReactNode;
  // The members' vetoes and the signed-in member; omitted to hide the buttons.
  vetoes?: VetoesState;
  discordId?: string;
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
  isPlayed,
  onToggle,
  afterPodium,
  vetoes,
  discordId,
}: GamesListProps) => {
  const podium = games.slice(0, 3);
  const rest = games.slice(3);
  const leastHappy = games.length > 0 ? leastHappyPlayer(games[0]) : null;

  const vetoProps = (game: SelectedGame) => {
    const bggId = Number(game.id);
    if (!vetoes || !discordId || Number.isNaN(bggId)) return {};
    const vetoed = vetoes.all[discordId]?.has(game.id) ?? false;
    return {
      vetoed,
      vetoDisabled: vetoes.isSaving(bggId),
      vetoError: vetoes.errorFor(bggId),
      onVeto: () => (vetoed ? vetoes.unveto(bggId) : vetoes.veto(bggId)),
    };
  };

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
            played={isPlayed(game.id)}
            onToggle={() => onToggle(game.id)}
            leastHappy={i === 0 ? leastHappy : null}
            {...vetoProps(game)}
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
              played={isPlayed(game.id)}
              onToggle={() => onToggle(game.id)}
              {...vetoProps(game)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default GamesList;
