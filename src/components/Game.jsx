import games from "@/assets/games.json";
import BackButton from "@/components/BackButton";
import GameDetailHeader from "@/components/GameDetailHeader";
import PlayerScoresTable from "@/components/PlayerScoresTable";
import { gameBounds } from "@/lib/games";

const images = import.meta.glob("@/assets/games/*", {
  eager: true,
  import: "default",
});

const Game = ({ data, id }) => {
  const max = data.max;
  const players = data.by_id[id];

  if (!players || players.length === 0) {
    return null;
  }
  const game = games[id];
  const image = game
    ? game.image
      ? images[`/src/assets/games/${id}${game.ext}`]
      : null
    : null;
  const bounds = game && game.players ? gameBounds(games, id) : null;

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
