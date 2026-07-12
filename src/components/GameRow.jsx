import { Link } from "wouter";

import { Table } from "@mantine/core";

import PlayedCounter from "@/components/PlayedCounter";
import ScorePopover from "@/components/ScorePopover";
import { Score } from "@/util";

const GameRow = ({
  game,
  rank,
  selectedMax,
  individualMax,
  bounds,
  played,
  onInc,
  onDec,
}) => (
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
