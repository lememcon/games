import { useState } from "react";

import {
  Badge,
  Button,
  Group,
  NumberInput,
  Table,
  Text,
  TextInput,
} from "@mantine/core";

import { filterGamePlayers, formatBounds, validateOverride } from "@/lib/games";
import type { Bounds, GamePlayersRow } from "@/types";

interface RowProps {
  game: GamePlayersRow;
  saving: boolean;
  error?: string;
  onSave: (bggId: number, range: Bounds) => void;
  onReset: (bggId: number) => void;
}

const Row = ({ game, saving, error, onSave, onReset }: RowProps) => {
  const { bggId, name, bgg, override } = game;
  const [min, setMin] = useState<number | string>(override?.min ?? "");
  const [max, setMax] = useState<number | string>(override?.max ?? "");
  const touched = min !== "" || max !== "";
  const checked = validateOverride(min, max);
  const invalid = touched && "error" in checked ? checked.error : null;
  const range = "range" in checked ? checked.range : null;
  const changed =
    range !== null &&
    (range.min !== override?.min || range.max !== override?.max);
  const wider =
    range !== null &&
    bgg !== null &&
    (range.min < bgg.min || range.max > bgg.max);

  return (
    <Table.Tr>
      <Table.Td>{name}</Table.Td>
      <Table.Td>{bgg ? formatBounds(bgg) : "none"}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <NumberInput
            aria-label={`Minimum players for ${name}`}
            size="xs"
            w={70}
            min={1}
            max={99}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            value={min}
            onChange={setMin}
          />
          <Text span>-</Text>
          <NumberInput
            aria-label={`Maximum players for ${name}`}
            size="xs"
            w={70}
            min={1}
            max={99}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            value={max}
            onChange={setMax}
          />
          {override && (
            <Badge variant="light" color="orange">
              Overridden
            </Badge>
          )}
        </Group>
        {invalid && (
          <Text size="xs" c="red" role="alert">
            {invalid}
          </Text>
        )}
        {wider && !invalid && (
          <Text size="xs" c="yellow.8">
            Wider than BGG&apos;s range
          </Text>
        )}
        {error && (
          <Text size="xs" c="red" role="alert">
            {error}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            aria-label={`Save ${name}`}
            loading={saving}
            disabled={!changed}
            onClick={() => onSave(bggId, range!)}
          >
            Save
          </Button>
          <Button
            size="xs"
            variant="default"
            aria-label={`Reset ${name}`}
            disabled={saving || !override}
            onClick={() => onReset(bggId)}
          >
            Reset
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
};

interface Props {
  games: GamePlayersRow[];
  saving: ReadonlySet<number>;
  errors: Record<number, string>;
  onSave: (bggId: number, range: Bounds) => void;
  onReset: (bggId: number) => void;
}

const PlayerCountsTable = ({
  games,
  saving,
  errors,
  onSave,
  onReset,
}: Props) => {
  const [query, setQuery] = useState("");
  const shown = filterGamePlayers(games, query);

  return (
    <>
      <TextInput
        aria-label="Filter games by name or id"
        placeholder="Filter by name or BGG id"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Game</Table.Th>
              <Table.Th>BGG</Table.Th>
              <Table.Th>Override</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((g) => (
              <Row
                // Remount after a save or reset so the inputs show server state.
                key={`${g.bggId}:${g.override?.min}-${g.override?.max}`}
                game={g}
                saving={saving.has(g.bggId)}
                error={errors[g.bggId]}
                onSave={onSave}
                onReset={onReset}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {shown.length === 0 && (
        <Text c="dimmed" size="sm">
          No games match.
        </Text>
      )}
    </>
  );
};

export default PlayerCountsTable;
