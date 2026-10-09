import BackButton from "@/components/BackButton";
import GameDetailHeader from "@/components/GameDetailHeader";
import PlayerScoresTable from "@/components/PlayerScoresTable";
import { realBounds, resolveImage } from "@/lib/games";
import bundledImages from "@/lib/images";
import type { Data, GamesData } from "@/types";

interface GameProps {
  data: Data;
  gameData: GamesData;
  id: string;
}

const Game = ({ data, gameData, id }: GameProps) => {
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
      <BackButton />
      <GameDetailHeader
        name={players[0].game}
        bounds={bounds}
        id={id}
        image={image}
      />
      <PlayerScoresTable players={players} max={max} />
      <BackButton style={{ marginTop: "2em" }} />
    </div>
  );
};

export default Game;
