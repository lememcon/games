import { Link } from "wouter";

import PlayedCounter from "@/components/PlayedCounter";
import ScorePopover from "@/components/ScorePopover";
import { medalColor, paletteColor } from "@/lib/colors";
import type { Bounds, SelectedGame } from "@/types";

interface GameCardProps {
  game: SelectedGame;
  rank: number;
  selectedMax: number;
  individualMax: number;
  bounds: Bounds | null;
  played: number;
  onInc: () => void;
  onDec: () => void;
}

// The podium unit: a full box-card with cover art, a corner rank chip, and the
// score meter. Clicking the score opens the per-player breakdown. Reserved for
// the top games where the extra weight is the payoff of the leaderboard.
const GameCard = ({
  game,
  rank,
  selectedMax,
  individualMax,
  bounds,
  played,
  onInc,
  onDec,
}: GameCardProps) => {
  const chip = medalColor(rank) ?? paletteColor(game.name);

  return (
    <div className="tray-card">
      <div className="tray-card__spine" style={{ background: chip }} />
      <div className="tray-card__body">
        <div className="tray-card__head">
          <div className="tray-cover tray-cover--lg">
            {game.image ? (
              <img src={game.image} alt={game.name} />
            ) : (
              <div className="tray-cover__blank" aria-hidden />
            )}
            <span className="tray-cover__chip" style={{ background: chip }}>
              {rank}
            </span>
          </div>
          <div className="tray-card__title">
            <div className="tray-eyebrow">Rank {rank}</div>
            <Link href={`/games/${game.id}`} className="tray-name">
              {game.name}
            </Link>
          </div>
        </div>

        <ScorePopover
          score={game.score}
          players={game.players}
          selectedMax={selectedMax}
          individualMax={individualMax}
        />

        <div className="tray-card__foot">
          {bounds && (
            <span className="tray-meta">
              {bounds.min}-{bounds.max}
            </span>
          )}
          <div className="tray-card__played">
            <PlayedCounter count={played} onInc={onInc} onDec={onDec} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameCard;
