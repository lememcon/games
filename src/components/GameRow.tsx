import { Link } from "wouter";

import { Checkbox, Text, useMantineTheme } from "@mantine/core";

import LeastHappy from "@/components/LeastHappy";
import PlayedByList from "@/components/PlayedByList";
import PlayedToggle from "@/components/PlayedToggle";
import ScorePopover from "@/components/ScorePopover";
import VetoToggle from "@/components/VetoToggle";
import { formatBounds } from "@/lib/games";
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
  played: boolean;
  onToggle: () => void;
  vetoed?: boolean;
  // Vetoed for this year only.
  yearVetoed?: boolean;
  vetoDisabled?: boolean;
  // Shown beside the veto button when saving it failed.
  vetoError?: string | null;
  // Opens the veto dialog. Omitted to hide the veto button.
  onVeto?: () => void;
  // Bulk-veto mode: show a checkbox and hide the per-game buttons.
  selectable?: boolean;
  checked?: boolean;
  selectDisabled?: boolean;
  onSelect?: () => void;
  // Name of the least happy scorer, shown beside the bounds.
  leastHappy?: string | null;
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
  played,
  onToggle,
  vetoed = false,
  yearVetoed = false,
  vetoDisabled,
  vetoError,
  onVeto,
  selectable = false,
  checked = false,
  selectDisabled = false,
  onSelect,
  leastHappy,
}: GameRowProps) => {
  const theme = useMantineTheme();
  const chip = score_color(theme, normalized_score(game.score, selectedMax));

  return (
    <div className={`tray-row${selectable && checked ? " tray-selected" : ""}`}>
      {selectable && (
        <Checkbox
          className="tray-select"
          aria-label={`Select ${game.name}`}
          checked={checked}
          disabled={selectDisabled}
          onChange={() => onSelect?.()}
        />
      )}
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
        <div className="tray-row__head">
          <Link href={gamePath(year, game.id)} className="tray-name">
            {game.name}
          </Link>
          {(bounds || leastHappy) && (
            <div className="tray-row__meta">
              {bounds && (
                <span className="tray-meta">{formatBounds(bounds)}</span>
              )}
              {leastHappy && (
                <LeastHappy
                  game={game}
                  name={leastHappy}
                  individualMax={individualMax}
                />
              )}
            </div>
          )}
        </div>
        <PlayedByList playedBy={game.playedBy} />
      </div>

      <div className="tray-row__score">
        <ScorePopover
          score={game.score}
          players={game.players}
          selectedMax={selectedMax}
          individualMax={individualMax}
        />
      </div>

      {!selectable && (
        <div className="tray-row__actions">
          <PlayedToggle game={game.name} played={played} onToggle={onToggle} />
          {onVeto && (
            <VetoToggle
              game={game.name}
              vetoed={vetoed}
              yearVetoed={yearVetoed}
              year={year}
              disabled={vetoDisabled}
              onOpen={onVeto}
            />
          )}
          {vetoError && (
            <Text role="alert" c="red" size="xs" w="100%">
              {vetoError}
            </Text>
          )}
        </div>
      )}
    </div>
  );
};

export default GameRow;
