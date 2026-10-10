import { Link } from "wouter";

import { useMantineTheme } from "@mantine/core";

import PlayedCounter from "@/components/PlayedCounter";
import PlayerRange from "@/components/PlayerRange";
import ScorePopover from "@/components/ScorePopover";
import { gamePath } from "@/lib/routes";
import type { Bounds, SelectedGame } from "@/types";
import { normalized_score, score_color } from "@/util";

interface GameRowProps {
  game: SelectedGame;
  year: string;
  rank: number;
  selectedMax: number;
  individualMax: number;
  bounds: Bounds | null;
  // BGG's range when an admin restricted this game.
  original?: Bounds | null;
  played: number;
  onInc: () => void;
  onDec: () => void;
}

// The compact chase unit: a mini horizontal card keeping the tray language
// (cover art, corner rank chip, score) at roughly a third the height of a
// GameCard. Clicking the score opens the per-player breakdown. Below the podium
// the rank chip takes its color from the game's score band, echoing the score
// bar so a glance down the list reads strong-to-weak.
const GameRow = ({
  game,
  year,
  rank,
  selectedMax,
  individualMax,
  bounds,
  original,
  played,
  onInc,
  onDec,
}: GameRowProps) => {
  const theme = useMantineTheme();
  const chip = score_color(theme, normalized_score(game.score, selectedMax));

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
        <Link href={gamePath(year, game.id)} className="tray-name">
          {game.name}
        </Link>
        {bounds && (
          <div className="tray-row__meta">
            <span className="tray-meta">
              <PlayerRange bounds={bounds} original={original} />
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
