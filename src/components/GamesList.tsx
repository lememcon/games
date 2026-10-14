import { useState } from "react";
import type { ReactNode } from "react";

import { Button, Text } from "@mantine/core";

import GameCard from "@/components/GameCard";
import GameRow from "@/components/GameRow";
import SelectBar from "@/components/SelectBar";
import type { VetoesState } from "@/hooks/useVetoes";
import { leastHappyPlayer, realBounds } from "@/lib/games";
import { toggleSelected, vetoTargets } from "@/lib/selection";
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
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const canSelect = !!vetoes && !!discordId && games.length > 0;
  const busy = !!vetoes && vetoes.saving.size > 0;
  const active = selecting && canSelect;
  // Ids no longer in the list (a filter changed) are dropped.
  const selected = new Set(
    games.map((g) => g.id).filter((id) => picked.has(id)),
  );

  const exit = () => {
    vetoes?.clearBulkError();
    setSelecting(false);
    setPicked(new Set());
  };

  const apply = async () => {
    if (!vetoes || !discordId) return;
    const targets = vetoTargets(selected, vetoes.all[discordId]);
    const failed = new Set((await vetoes.vetoMany(targets)).map(String));
    if (failed.size === 0) exit();
    else setPicked(new Set([...selected].filter((id) => failed.has(id))));
  };

  const selectProps = (game: SelectedGame) =>
    active
      ? {
          selectable: true,
          checked: selected.has(game.id),
          selectDisabled: busy,
          onSelect: () => setPicked(toggleSelected(selected, game.id)),
        }
      : {};

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
    <div className={`tray-list${active ? " tray-list--selecting" : ""}`}>
      {canSelect && (
        <Button
          size="xs"
          variant="default"
          disabled={busy}
          aria-pressed={active}
          onClick={() => {
            if (active) exit();
            else {
              vetoes?.clearBulkError();
              setSelecting(true);
            }
          }}
          style={{ alignSelf: "flex-start" }}
        >
          Select
        </Button>
      )}
      {vetoes?.bulkError && (
        <Text role="alert" c="red" size="sm">
          {vetoes.bulkError}
        </Text>
      )}
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
            {...selectProps(game)}
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
              {...selectProps(game)}
            />
          ))}
        </div>
      )}

      {active && (
        <SelectBar
          count={selected.size}
          disabled={busy}
          onApply={apply}
          onCancel={exit}
        />
      )}
    </div>
  );
};

export default GamesList;
