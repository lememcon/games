import { CircleArrowLeft } from "lucide-react";
import { Link } from "wouter";

import { Button, Table } from "@mantine/core";

import { descend, map, prop, sort } from "ramda";

import games from "@/assets/games.json";

const images = import.meta.glob("@/assets/games/*", {
  eager: true,
  import: "default",
});

const BGG_URL = "https://boardgamegeek.com/boardgame/";

const Game = ({ data, id }) => {
  const players = data.by_id[id];

  if (!players || players.length === 0) {
    return null;
  }
  const game = games[id];
  const image = game.image
    ? images[`/src/assets/games/${id}${game.ext}`]
    : null;

  const player_nodes = map(
    (player) => (
      <Table.Tr key={player.player}>
        <Table.Td>{player.player}</Table.Td>
        <Table.Td>{player.rank}</Table.Td>
        <Table.Td>{player.score}</Table.Td>
      </Table.Tr>
    ),
    sort(descend(prop("score")), players),
  );

  return (
    <div>
      <Link href="/">
        <Button>
          <CircleArrowLeft color="white" size="16" />
        </Button>
      </Link>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: "1em",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>{players[0].game}</h1>
          <p>
            <strong>Players:</strong>
            &nbsp;
            {game.players.min}-{game.players.max}
          </p>
          <a href={`${BGG_URL}${id}/`} target="_blank">
            BGG Page
          </a>
        </div>
        {image && <img src={image} width="200" />}
      </div>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Player</Table.Th>
            <Table.Th>Rank</Table.Th>
            <Table.Th>Score</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{player_nodes}</Table.Tbody>
      </Table>
      <Link href="/">
        <Button style={{ marginTop: "2em" }}>
          <CircleArrowLeft color="white" size="16" />
        </Button>
      </Link>
    </div>
  );
};

export default Game;
