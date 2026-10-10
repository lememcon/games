import BackButton from "@/components/BackButton";
import GameDetailHeader from "@/components/GameDetailHeader";
import MyPlayerRange from "@/components/MyPlayerRange";
import PlayerScoresTable from "@/components/PlayerScoresTable";
import type { PlayerOverridesState } from "@/hooks/usePlayerOverrides";
import { realBounds, resolveImage } from "@/lib/games";
import bundledImages from "@/lib/images";
import { yearPath } from "@/lib/routes";
import type { Data, GamesData } from "@/types";

interface GameProps {
  data: Data;
  gameData: GamesData;
  id: string;
  year: string;
  // The member's own player count range for this game; omitted to hide the form.
  overrides?: PlayerOverridesState;
  // The signed-in member's Discord id, the key of their ranges in `overrides`.
  discordId?: string;
}

const Game = ({
  data,
  gameData,
  id,
  year,
  overrides,
  discordId,
}: GameProps) => {
  const max = data.max;
  const players = data.by_id[id];

  if (!players || players.length === 0) {
    return null;
  }
  const meta = gameData[id];
  const image = resolveImage(id, meta, bundledImages) ?? null;
  const bounds = realBounds(meta);
  const stored = (discordId && overrides?.all[discordId]?.[id]) || null;

  return (
    <div>
      <BackButton href={yearPath(year)} />
      <GameDetailHeader
        name={players[0].game}
        bounds={bounds}
        id={id}
        image={image}
      />
      <PlayerScoresTable players={players} max={max} />
      {overrides && discordId && bounds && (
        <MyPlayerRange
          // Remount after a save or reset so the inputs show server state.
          key={`${id}:${stored?.min}-${stored?.max}-${bounds.min}-${bounds.max}`}
          allowed={bounds}
          stored={stored}
          saving={overrides.saving}
          error={overrides.error}
          onSave={(range) => overrides.save(Number(id), range)}
          onReset={() => overrides.reset(Number(id))}
        />
      )}
      <BackButton href={yearPath(year)} style={{ marginTop: "2em" }} />
    </div>
  );
};

export default Game;
