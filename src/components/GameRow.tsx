import { Link } from "wouter";

import { Table } from "@mantine/core";

import PlayedCounter from "@/components/PlayedCounter";
import ScorePopover from "@/components/ScorePopover";
import type { Bounds, SelectedGame } from "@/types";
import { Score } from "@/util";

interface GameRowProps {
  game: SelectedGame;
  rank: number;
  selectedMax: number;
  individualMax: number;
  bounds: Bounds | null;
  played: number;
  onInc: () => void;
  onDec: () => void;
}

const GameRow = ({
  game,
  rank,
  selectedMax,
  individualMax,
  bounds,
  played,
  onInc,
  onDec,
}: GameRowProps) => (
  <Table.Tr>
    <Table.Td>{rank}.</Table.Td>
    <Table.Td>
      <img src={game.image} width="50" />
    </Table.Td>
    <Table.Td>
      <Link href={`/games/${game.id}`}>{game.name}</Link>
    </Table.Td>
    <Table.Td>
      <ScorePopover
        score={game.score}
        players={game.players}
        selectedMax={selectedMax}
        individualMax={individualMax}
      />
    </Table.Td>
    <Table.Td>{bounds && `${bounds.min}-${bounds.max}`}</Table.Td>
    <Table.Td>
      <PlayedCounter count={played} onInc={onInc} onDec={onDec} />
    </Table.Td>
  </Table.Tr>
);

export default GameRow;
