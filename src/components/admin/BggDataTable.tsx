import { useState } from "react";

import { Badge, Checkbox, Table, Text, TextInput } from "@mantine/core";

import { filterGames, toggleAll, toggleId } from "@/lib/bgg";
import type { BggGameRow, BggGameState } from "@/types";

const COLORS: Record<BggGameState, string> = {
  loaded: "green",
  partial: "yellow",
  missing: "red",
};

interface Props {
  games: BggGameRow[];
  selected: number[];
  onSelectedChange: (selected: number[]) => void;
  disabled: boolean;
}

const BggDataTable = ({
  games,
  selected,
  onSelectedChange,
  disabled,
}: Props) => {
  const [query, setQuery] = useState("");
  const shown = filterGames(games, query);
  const shownIds = shown.map((g) => g.bggId);
  const allSelected =
    shownIds.length > 0 && shownIds.every((id) => selected.includes(id));

  return (
    <>
      <TextInput
        aria-label="Filter games"
        placeholder="Filter by name or BGG id"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>
                <Checkbox
                  aria-label="Select all shown games"
                  checked={allSelected}
                  disabled={disabled || shownIds.length === 0}
                  onChange={() =>
                    onSelectedChange(toggleAll(selected, shownIds))
                  }
                />
              </Table.Th>
              <Table.Th>ID</Table.Th>
              <Table.Th>Game</Table.Th>
              <Table.Th>Years</Table.Th>
              <Table.Th>Players</Table.Th>
              <Table.Th>Image</Table.Th>
              <Table.Th>State</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((g) => (
              <Table.Tr key={g.bggId}>
                <Table.Td>
                  <Checkbox
                    aria-label={`Select ${g.name}`}
                    checked={selected.includes(g.bggId)}
                    disabled={disabled}
                    onChange={() =>
                      onSelectedChange(toggleId(selected, g.bggId))
                    }
                  />
                </Table.Td>
                <Table.Td>{g.bggId}</Table.Td>
                <Table.Td>{g.name}</Table.Td>
                <Table.Td>{g.years.join(", ")}</Table.Td>
                <Table.Td>{g.hasPlayers ? "yes" : "no"}</Table.Td>
                <Table.Td>{g.hasImage ? "yes" : "no"}</Table.Td>
                <Table.Td>
                  <Badge color={COLORS[g.state]} variant="light">
                    {g.state}
                  </Badge>
                </Table.Td>
              </Table.Tr>
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

export default BggDataTable;
