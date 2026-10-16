import { useState } from "react";
import type { ReactNode } from "react";

import { Button, Text } from "@mantine/core";

import GameCard from "@/components/GameCard";
import GameRow from "@/components/GameRow";
import SelectBar from "@/components/SelectBar";
import type { VetoesState } from "@/hooks/useVetoes";
import type { YearVetoesState } from "@/hooks/useYearVetoes";
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
  // The members' every-year and this-year vetoes and the signed-in member;
  // omitted to hide the buttons.
  vetoes?: VetoesState;
  yearVetoes?: YearVetoesState;
  discordId?: string;
  // A game's veto button was pressed (by bgg id); the caller opens the dialog.
  onOpenVeto?: (bggId: number) => void;
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
  yearVetoes,
  discordId,
  onOpenVeto,
}: GamesListProps) => {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const canSelect = !!vetoes && !!discordId && games.length > 0;
  const busy =
    (!!vetoes && vetoes.saving.size > 0) ||
    (!!yearVetoes && yearVetoes.saving.size > 0);
  const active = selecting && canSelect;
  // Ids no longer in the list (a filter changed) are dropped.
  const selected = new Set(
    games.map((g) => g.id).filter((id) => picked.has(id)),
  );

  const exit = () => {
    vetoes?.clearBulkError();
    yearVetoes?.clearBulkError();
    setSelecting(false);
    setPicked(new Set());
  };

  const apply = async (scope: "all" | "year") => {
    const store = scope === "year" ? yearVetoes : vetoes;
    if (!store || !discordId) return;
    const targets = vetoTargets(selected, store.all[discordId]);
    const failed = new Set((await store.vetoMany(targets)).map(String));
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

  const vetoProps = (game: SelectedGame) => {
    const bggId = Number(game.id);
    if (!vetoes || !discordId || Number.isNaN(bggId)) return {};
    return {
      vetoed: vetoes.all[discordId]?.has(game.id) ?? false,
      yearVetoed: yearVetoes?.all[discordId]?.has(game.id) ?? false,
      vetoDisabled:
        vetoes.isSaving(bggId) || (yearVetoes?.isSaving(bggId) ?? false),
      vetoError: vetoes.errorFor(bggId) ?? yearVetoes?.errorFor(bggId) ?? null,
      onVeto: () => onOpenVeto?.(bggId),
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
              yearVetoes?.clearBulkError();
              setSelecting(true);
            }
          }}
          style={{ alignSelf: "flex-start" }}
        >
          Select
        </Button>
      )}
      {(vetoes?.bulkError || yearVetoes?.bulkError) && (
        <Text role="alert" c="red" size="sm">
          {vetoes?.bulkError}
          {vetoes?.bulkError && yearVetoes?.bulkError && " "}
          {yearVetoes?.bulkError}
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
            leastHappy={leastHappyPlayer(game)}
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
              leastHappy={leastHappyPlayer(game)}
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
          year={year}
          showYear={!!yearVetoes}
          onApply={apply}
          onCancel={exit}
        />
      )}
    </div>
  );
};

export default GamesList;
