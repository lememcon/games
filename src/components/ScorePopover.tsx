import { Popover, Table } from "@mantine/core";

import { map, prop, sortBy, values } from "ramda";

import PlayerName from "@/components/PlayerName";
import Score from "@/components/Score";
import type { SelectedGamePlayer } from "@/types";

interface ScorePopoverProps {
  score: number;
  players: Record<string, SelectedGamePlayer>;
  selectedMax: number;
  individualMax: number;
}

// Clicking the aggregate score opens a breakdown of every selected player's
// rank and score for that game. The target's own score is normalized against
// selectedMax; each player's against individualMax.
const ScorePopover = ({
  score,
  players,
  selectedMax,
  individualMax,
}: ScorePopoverProps) => (
  <Popover withArrow arrowPosition="side" arrowSize={12} shadow="lg">
    <Popover.Target>
      <div style={{ cursor: "pointer" }}>
        <Score score={score} max={selectedMax} />
      </div>
    </Popover.Target>
    <Popover.Dropdown>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Player</Table.Th>
            <Table.Th>Rank</Table.Th>
            <Table.Th>Score</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {map(
            (player: SelectedGamePlayer) => (
              <Table.Tr key={player.name}>
                <Table.Td>
                  <PlayerName name={player.name} />
                </Table.Td>
                <Table.Td>{player.rank}</Table.Td>
                <Table.Td>
                  <Score score={player.score} max={individualMax} />
                </Table.Td>
              </Table.Tr>
            ),
            sortBy(prop("rank"), values(players)),
          )}
        </Table.Tbody>
      </Table>
    </Popover.Dropdown>
  </Popover>
);

export default ScorePopover;
