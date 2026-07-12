import { Link } from "wouter";

import PlayedCounter from "@/components/PlayedCounter";
import ScorePopover from "@/components/ScorePopover";
import { medalColor, paletteColor } from "@/lib/colors";
import type { Bounds, SelectedGame } from "@/types";

interface GameRowProps {
  game: SelectedGame;
  rank: number;
  selectedMax: number;
  individualMax: number;
  bounds: Bounds | null;
  played: number;
  onInc: () => void;
  onDec: () => void;
}

// The compact chase unit: a mini horizontal card keeping the tray language
// (cover art, corner rank chip, score) at roughly a third the height of a
// GameCard. Clicking the score opens the per-player breakdown.
const GameRow = ({
  game,
  rank,
  selectedMax,
  individualMax,
  bounds,
  played,
  onInc,
  onDec,
}: GameRowProps) => {
  const chip = medalColor(rank) ?? paletteColor(game.name);

  return (
    <div className="tray-row">
      <div className="tray-cover tray-cover--sm">
        {game.image ? (
          <img src={game.image} alt={game.name} />
        ) : (
          <div className="tray-cover__blank" aria-hidden />
        )}
        <span className="tray-cover__chip" style={{ background: chip }}>
          {rank}
        </span>
      </div>

      <div className="tray-row__main">
        <Link href={`/games/${game.id}`} className="tray-name">
          {game.name}
        </Link>
        {bounds && (
          <div className="tray-row__meta">
            <span className="tray-meta">
              {bounds.min}-{bounds.max}
            </span>
          </div>
        )}
      </div>

      <div className="tray-row__score">
        <ScorePopover
          score={game.score}
          players={game.players}
          selectedMax={selectedMax}
          individualMax={individualMax}
        />
      </div>

      <PlayedCounter count={played} onInc={onInc} onDec={onDec} />
    </div>
  );
};

export default GameRow;
