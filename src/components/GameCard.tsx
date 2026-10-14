import { Link } from "wouter";

import { Checkbox, Text } from "@mantine/core";

import PlayedByList from "@/components/PlayedByList";
import PlayedToggle from "@/components/PlayedToggle";
import PlayerName from "@/components/PlayerName";
import ScorePopover from "@/components/ScorePopover";
import VetoToggle from "@/components/VetoToggle";
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
  played: boolean;
  onToggle: () => void;
  vetoed?: boolean;
  vetoDisabled?: boolean;
  // Shown beside the veto button when saving it failed.
  vetoError?: string | null;
  // Omitted to hide the veto button.
  onVeto?: () => void;
  // Bulk-veto mode: show a checkbox and hide the per-game buttons.
  selectable?: boolean;
  checked?: boolean;
  selectDisabled?: boolean;
  onSelect?: () => void;
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
  onToggle,
  vetoed = false,
  vetoDisabled,
  vetoError,
  onVeto,
  selectable = false,
  checked = false,
  selectDisabled = false,
  onSelect,
  leastHappy,
}: GameCardProps) => {
  const chip = medalColor(rank) ?? PALETTE[(rank - 1) % PALETTE.length];

  return (
    <div
      className={`tray-card${selectable && checked ? " tray-selected" : ""}`}
    >
      {selectable && (
        <Checkbox
          className="tray-select"
          aria-label={`Select ${game.name}`}
          checked={checked}
          disabled={selectDisabled}
          onChange={() => onSelect?.()}
        />
      )}
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
          {!selectable && (
            <div className="tray-card__played">
              <PlayedToggle
                game={game.name}
                played={played}
                onToggle={onToggle}
              />
              {onVeto && (
                <VetoToggle
                  game={game.name}
                  vetoed={vetoed}
                  disabled={vetoDisabled}
                  onToggle={onVeto}
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
      </div>
    </div>
  );
};

export default GameCard;
