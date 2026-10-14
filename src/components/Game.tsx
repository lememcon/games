import BackButton from "@/components/BackButton";
import GameDetailHeader from "@/components/GameDetailHeader";
import MyPlayerRange from "@/components/MyPlayerRange";
import MyVeto from "@/components/MyVeto";
import PlayerScoresTable from "@/components/PlayerScoresTable";
import YearSparkline from "@/components/YearSparkline";
import type { PlayerOverridesState } from "@/hooks/usePlayerOverrides";
import type { VetoesState } from "@/hooks/useVetoes";
import useYearTotals from "@/hooks/useYearTotals";
import { realBounds, resolveImage } from "@/lib/games";
import bundledImages from "@/lib/images";
import { yearPath } from "@/lib/routes";
import { seriesFor } from "@/lib/yearTotals";
import type { Data, GamesData } from "@/types";

interface GameProps {
  data: Data;
  gameData: GamesData;
  id: string;
  year: string;
  // The member's own player count range for this game; omitted to hide the form.
  overrides?: PlayerOverridesState;
  // The members' vetoes, for every year; omitted to hide the switch.
  vetoes?: VetoesState;
  // The signed-in member's Discord id, the key of their ranges in `overrides`
  // and their vetoes in `vetoes`.
  discordId?: string;
  // Where the back buttons go; defaults to the year's scoreboard.
  backHref?: string;
}

const Game = ({
  data,
  gameData,
  id,
  year,
  overrides,
  vetoes,
  discordId,
  backHref = yearPath(year),
}: GameProps) => {
  const { totals } = useYearTotals();
  const max = data.max;
  const players = data.by_id[id];
  const bggId = Number(id);

  if (!players || players.length === 0) {
    return null;
  }
  const meta = gameData[id];
  const image = resolveImage(id, meta, bundledImages) ?? null;
  const bounds = realBounds(meta);
  const stored = (discordId && overrides?.all[discordId]?.[id]) || null;

  return (
    <div>
      <BackButton href={backHref} />
      <GameDetailHeader
        name={players[0].game}
        bounds={bounds}
        id={id}
        image={image}
      />
      <PlayerScoresTable players={players} max={max} />
      <YearSparkline series={seriesFor(totals, bggId)} />
      {overrides && discordId && bounds && (
        <MyPlayerRange
          // Remount after a save or reset so the inputs show server state.
          key={`${id}:${stored?.min}-${stored?.max}-${bounds.min}-${bounds.max}`}
          allowed={bounds}
          stored={stored}
          saving={overrides.saving}
          error={overrides.error}
          onSave={(range) => overrides.save(bggId, range)}
          onReset={() => overrides.reset(bggId)}
        />
      )}
      {vetoes && discordId && (
        <MyVeto
          vetoed={vetoes.all[discordId]?.has(id) ?? false}
          saving={vetoes.isSaving(bggId)}
          error={vetoes.errorFor(bggId)}
          onChange={(on) => (on ? vetoes.veto(bggId) : vetoes.unveto(bggId))}
        />
      )}
      <BackButton
        href={backHref}
        style={{ marginTop: "var(--mantine-spacing-lg)" }}
      />
    </div>
  );
};

export default Game;
