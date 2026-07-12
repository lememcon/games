import { Table } from "@mantine/core";

import { addIndex, map } from "ramda";

import GameRow from "@/components/GameRow";

const GamesTable = ({
  games,
  selectedMax,
  individualMax,
  gameData,
  getPlayedCount,
  onInc,
  onDec,
}) => (
  <Table>
    <Table.Thead>
      <Table.Tr>
        <Table.Th>Rank</Table.Th>
        <Table.Th>Game</Table.Th>
        <Table.Th></Table.Th>
        <Table.Th>Score</Table.Th>
        <Table.Th>Players</Table.Th>
        <Table.Th>Played</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {addIndex(map)((game, i) => {
        const meta = gameData[game.id];
        const bounds =
          meta && meta.players
            ? { min: meta.players.min, max: meta.players.max }
            : null;

        return (
          <GameRow
            key={game.name}
            game={game}
            rank={i + 1}
            selectedMax={selectedMax}
            individualMax={individualMax}
            bounds={bounds}
            played={getPlayedCount(game.id)}
            onInc={() => onInc(game.id)}
            onDec={() => onDec(game.id)}
          />
        );
      }, games)}
    </Table.Tbody>
  </Table>
);

export default GamesTable;
