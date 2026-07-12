import { Table } from "@mantine/core";

import { descend, map, prop, sort } from "ramda";

import Score from "@/components/Score";
import type { PlayerGameScore } from "@/types";

interface PlayerScoresTableProps {
  players: PlayerGameScore[];
  max: number;
}

const PlayerScoresTable = ({ players, max }: PlayerScoresTableProps) => (
  <Table>
    <Table.Thead>
      <Table.Tr>
        <Table.Th>Player</Table.Th>
        <Table.Th>Normalized Score</Table.Th>
        <Table.Th>Rank</Table.Th>
        <Table.Th>Raw Score</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {map(
        (player: PlayerGameScore) => (
          <Table.Tr key={player.player}>
            <Table.Td>{player.player}</Table.Td>
            <Table.Td style={{ verticalAlign: "middle" }}>
              <Score score={player.score} max={max} />
            </Table.Td>
            <Table.Td>{player.rank}</Table.Td>
            <Table.Td>{player.score}</Table.Td>
          </Table.Tr>
        ),
        sort(descend(prop("score")), players),
      )}
    </Table.Tbody>
  </Table>
);

export default PlayerScoresTable;
