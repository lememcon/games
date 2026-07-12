import { Table } from "@mantine/core";

import GameRow from "@/components/GameRow";
import type { GamesData, SelectedGame } from "@/types";

interface GamesTableProps {
  games: SelectedGame[];
  selectedMax: number;
  individualMax: number;
  gameData: GamesData;
  getPlayedCount: (id: string) => number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
}

const GamesTable = ({
  games,
  selectedMax,
  individualMax,
  gameData,
  getPlayedCount,
  onInc,
  onDec,
}: GamesTableProps) => (
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
      {games.map((game, i) => {
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
      })}
    </Table.Tbody>
  </Table>
);

export default GamesTable;
