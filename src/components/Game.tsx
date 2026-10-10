import BackButton from "@/components/BackButton";
import GameDetailHeader from "@/components/GameDetailHeader";
import PlayerScoresTable from "@/components/PlayerScoresTable";
import { originalBounds, realBounds, resolveImage } from "@/lib/games";
import bundledImages from "@/lib/images";
import { yearPath } from "@/lib/routes";
import type { Data, GamesData } from "@/types";

interface GameProps {
  data: Data;
  gameData: GamesData;
  id: string;
  year: string;
}

const Game = ({ data, gameData, id, year }: GameProps) => {
  const max = data.max;
  const players = data.by_id[id];

  if (!players || players.length === 0) {
    return null;
  }
  const meta = gameData[id];
  const image = resolveImage(id, meta, bundledImages) ?? null;
  const bounds = realBounds(meta);

  return (
    <div>
      <BackButton href={yearPath(year)} />
      <GameDetailHeader
        name={players[0].game}
        bounds={bounds}
        original={originalBounds(meta)}
        id={id}
        image={image}
      />
      <PlayerScoresTable players={players} max={max} />
      <BackButton href={yearPath(year)} style={{ marginTop: "2em" }} />
    </div>
  );
};

export default Game;
