import { Link } from "wouter";

import PlayedByList from "@/components/PlayedByList";
import PlayedCounter from "@/components/PlayedCounter";
import PlayerName from "@/components/PlayerName";
import ScorePopover from "@/components/ScorePopover";
import { PALETTE, medalColor } from "@/lib/colors";
import { formatBounds } from "@/lib/games";
import { gamePath } from "@/lib/routes";
import type { Bounds, SelectedGame } from "@/types";

interface GameCardProps {
  game: SelectedGame;
  year: string;
  rank: number;
  selectedMax: number;
  individualMax: number;
  bounds: Bounds | null;
  played: number;
  onInc: () => void;
  onDec: () => void;
  // Name of the least happy scorer, shown on the top result only.
  leastHappy?: string | null;
}

// The podium unit: a full box-card with cover art, a corner rank chip, and the
// score meter. Clicking the score opens the per-player breakdown. Reserved for
// the top games where the extra weight is the payoff of the leaderboard.
const GameCard = ({
  game,
  year,
  rank,
  selectedMax,
  individualMax,
  bounds,
  played,
  onInc,
  onDec,
  leastHappy,
}: GameCardProps) => {
  const chip = medalColor(rank) ?? PALETTE[(rank - 1) % PALETTE.length];

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
            <Link href={gamePath(year, game.id)} className="tray-name">
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

        {leastHappy && (
          <div className="tray-meta">
            least happy:{" "}
            <PlayerName
              name={leastHappy}
              discordId={game.players[leastHappy]?.discordId}
              image={game.players[leastHappy]?.discordImage}
            />
          </div>
        )}

        <PlayedByList playedBy={game.playedBy} />

        <div className="tray-card__foot">
          {bounds && <span className="tray-meta">{formatBounds(bounds)}</span>}
          <div className="tray-card__played">
            <PlayedCounter count={played} onInc={onInc} onDec={onDec} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameCard;
